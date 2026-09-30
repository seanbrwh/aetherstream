import { Request, Response } from "express";
import { prisma } from "../db.js";

export const createPost = async (req: Request, res: Response): Promise<void> => {
  try {
    const { content, location, telemetry } = req.body;
    const authorId = (req as any).user.userId;

    if (!content && !location && !req.files) {
      res
        .status(400)
        .json({ error: "Post must contain either case notes, location info, or attached media." });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const photoFile = files?.photo?.[0];
    const audioFile = files?.audio?.[0];

    const imageUrl = photoFile ? `/uploads/${photoFile.filename}` : null;
    const audioUrl = audioFile ? `/uploads/${audioFile.filename}` : null;

    let parsedTelemetry: any = null;
    if (telemetry) {
      try {
        parsedTelemetry = typeof telemetry === "string" ? JSON.parse(telemetry) : telemetry;
      } catch (parseErr) {
        console.error("Failed to parse telemetry JSON:", parseErr);
      }
    }

    const newPost = await prisma.post.create({
      data: {
        content: content || "",
        location: location || null,
        imageUrl,
        audioUrl,
        telemetry: parsedTelemetry,
        authorId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            callsign: true,
            role: true,
            avatarUrl: true,
          },
        },
        likes: {
          select: { userId: true },
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                callsign: true,
              },
            },
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    // Detect @CALLSIGN or @username mentions and create notifications
    const mentions = (content || "").match(/@(\w+)/g);
    if (mentions && mentions.length > 0) {
      const io = req.app.get("io");
      const tags = Array.from(new Set(mentions.map((m: string) => m.slice(1).toUpperCase())));

      for (const tag of tags) {
        const mentionedUser = await prisma.user.findFirst({
          where: {
            OR: [
              { callsign: { equals: tag, mode: "insensitive" } },
              { username: { equals: tag, mode: "insensitive" } },
            ],
            NOT: { id: authorId },
          },
        });

        if (mentionedUser) {
          const authorLabel = newPost.author.callsign
            ? `[${newPost.author.callsign}]`
            : `@${newPost.author.username}`;
          const notif = await prisma.notification.create({
            data: {
              userId: mentionedUser.id,
              type: "MENTION",
              title: "Mentioned in Field Dispatch",
              content: `${authorLabel} mentioned your unit in an incident log.`,
              link: "/feed",
            },
          });

          if (io) {
            io.to(`user:${mentionedUser.id}`).emit("new_notification", notif);
          }
        }
      }
    }

    res.json({
      ...newPost,
      likeCount: newPost._count.likes,
      commentCount: newPost._count.comments,
      isLiked: false,
      isFollowingAuthor: false,
    });
  } catch (error) {
    console.error("Create Post Error:", error);
    res.status(500).json({ error: "Failed to create post" });
  }
};

export const getFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = (req as any).user.userId;
    const { scope } = req.query;

    const userFollows = await prisma.follow.findMany({
      where: { followerId: currentUserId },
      select: { followingId: true },
    });
    const followedIds = new Set(userFollows.map((f) => f.followingId));

    const whereClause: any = {};
    if (scope === "following") {
      whereClause.authorId = {
        in: Array.from(followedIds).concat(currentUserId),
      };
    }

    const posts = await prisma.post.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            callsign: true,
            role: true,
            avatarUrl: true,
          },
        },
        likes: {
          select: { userId: true },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                callsign: true,
              },
            },
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    const formattedPosts = posts.map((post) => ({
      ...post,
      likeCount: post._count.likes,
      commentCount: post._count.comments,
      isLiked: post.likes.some((like) => like.userId === currentUserId),
      isFollowingAuthor: followedIds.has(post.authorId),
    }));

    res.json(formattedPosts);
  } catch (error) {
    console.error("Fetch Feed Error:", error);
    res.status(500).json({ error: "Failed to fetch the feed" });
  }
};

export const toggleFollow = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = (req as any).user.userId;
    const targetUserId = req.params.userId as string;

    if (currentUserId === targetUserId) {
      res.status(400).json({ error: "You cannot follow your own station frequency." });
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      res.status(404).json({ error: "Target investigator not found." });
      return;
    }

    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });

    if (existingFollow) {
      await prisma.follow.delete({
        where: { id: existingFollow.id },
      });
      res.json({ following: false });
    } else {
      await prisma.follow.create({
        data: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      });

      // Notify target user
      const follower = await prisma.user.findUnique({ where: { id: currentUserId } });
      const followerLabel = follower?.callsign
        ? `[${follower.callsign}]`
        : `@${follower?.username}`;
      const notif = await prisma.notification.create({
        data: {
          userId: targetUserId,
          type: "FOLLOW",
          title: "Frequency Monitored",
          content: `${followerLabel} began monitoring your research feed.`,
          link: `/profile/${follower?.username}`,
        },
      });

      const io = req.app.get("io");
      if (io) {
        io.to(`user:${targetUserId}`).emit("new_notification", notif);
      }

      res.json({ following: true });
    }
  } catch (error) {
    console.error("Toggle Follow Error:", error);
    res.status(500).json({ error: "Failed to toggle follow status" });
  }
};

export const toggleLike = async (req: Request, res: Response): Promise<void> => {
  try {
    const postId = req.params.postId as string;
    const userId = (req as any).user.userId;

    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    if (existingLike) {
      await prisma.like.delete({
        where: { id: existingLike.id },
      });
      res.json({ liked: false });
    } else {
      await prisma.like.create({
        data: {
          userId,
          postId,
        },
      });

      // Notify post author if not liking own post
      const post = await prisma.post.findUnique({ where: { id: postId } });
      if (post && post.authorId !== userId) {
        const liker = await prisma.user.findUnique({ where: { id: userId } });
        const likerLabel = liker?.callsign ? `[${liker.callsign}]` : `@${liker?.username}`;
        const notif = await prisma.notification.create({
          data: {
            userId: post.authorId,
            type: "LIKE",
            title: "Dispatch Endorsement",
            content: `${likerLabel} endorsed your incident case file.`,
            link: "/feed",
          },
        });

        const io = req.app.get("io");
        if (io) {
          io.to(`user:${post.authorId}`).emit("new_notification", notif);
        }
      }

      res.json({ liked: true });
    }
  } catch (error) {
    console.error("Toggle Like Error:", error);
    res.status(500).json({ error: "Failed to toggle endorsement on post" });
  }
};

export const createComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const postId = req.params.postId as string;
    const { content } = req.body;
    const authorId = (req as any).user.userId;

    if (!content) {
      res.status(400).json({ error: "Comment content cannot be empty" });
      return;
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    const newComment = await prisma.comment.create({
      data: {
        content,
        postId,
        authorId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            callsign: true,
          },
        },
      },
    });

    // Check for mentions in comment
    const mentions = (content || "").match(/@(\w+)/g);
    if (mentions && mentions.length > 0) {
      const io = req.app.get("io");
      const tags = Array.from(new Set(mentions.map((m: string) => m.slice(1).toUpperCase())));

      for (const tag of tags) {
        const mentionedUser = await prisma.user.findFirst({
          where: {
            OR: [
              { callsign: { equals: tag, mode: "insensitive" } },
              { username: { equals: tag, mode: "insensitive" } },
            ],
            NOT: { id: authorId },
          },
        });

        if (mentionedUser) {
          const authorLabel = newComment.author.callsign
            ? `[${newComment.author.callsign}]`
            : `@${newComment.author.username}`;
          const notif = await prisma.notification.create({
            data: {
              userId: mentionedUser.id,
              type: "MENTION",
              title: "Mentioned in Case Comment",
              content: `${authorLabel} tagged your callsign in a case file note.`,
              link: "/feed",
            },
          });

          if (io) {
            io.to(`user:${mentionedUser.id}`).emit("new_notification", notif);
          }
        }
      }
    }

    res.json(newComment);
  } catch (error) {
    console.error("Create Comment Error:", error);
    res.status(500).json({ error: "Failed to create comment" });
  }
};

export const getInvestigators = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = (req as any).user.userId;

    const userFollows = await prisma.follow.findMany({
      where: { followerId: currentUserId },
      select: { followingId: true },
    });
    const followedIds = new Set(userFollows.map((f) => f.followingId));

    const investigators = await prisma.user.findMany({
      where: {
        NOT: { id: currentUserId },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        callsign: true,
        role: true,
        bio: true,
        location: true,
        gearLoadout: true,
        investigationsCount: true,
        avatarUrl: true,
      },
      orderBy: { username: "asc" },
    });

    const formatted = await Promise.all(
      investigators.map(async (inv) => {
        const [followersCount, followingCount, postsCount] = await Promise.all([
          prisma.follow.count({ where: { followingId: inv.id } }),
          prisma.follow.count({ where: { followerId: inv.id } }),
          prisma.post.count({ where: { authorId: inv.id } }),
        ]);

        return {
          ...inv,
          followersCount,
          followingCount,
          postsCount,
          isFollowing: followedIds.has(inv.id),
        };
      }),
    );

    res.json(formatted);
  } catch (error) {
    console.error("Fetch Investigators Error:", error);
    res.status(500).json({ error: "Failed to fetch investigator directory" });
  }
};

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = (req as any).user.userId;

    const notifications = await prisma.notification.findMany({
      where: { userId: currentUserId },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    res.json(notifications);
  } catch (error) {
    console.error("Fetch Notifications Error:", error);
    res.status(500).json({ error: "Failed to fetch alert log" });
  }
};

export const markNotificationsAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = (req as any).user.userId;

    await prisma.notification.updateMany({
      where: {
        userId: currentUserId,
        read: false,
      },
      data: {
        read: true,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Mark Read Error:", error);
    res.status(500).json({ error: "Failed to clear alerts" });
  }
};

export const getPublicProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = (req as any).user.userId;
    const rawUsername = req.params.username;
    const username = (Array.isArray(rawUsername) ? rawUsername[0] : rawUsername) || "";

    if (!username.trim()) {
      res.status(400).json({ error: "Username parameter is required." });
      return;
    }

    const targetUser = await prisma.user.findFirst({
      where: {
        username: {
          equals: username.trim(),
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        callsign: true,
        role: true,
        bio: true,
        location: true,
        gearLoadout: true,
        investigationsCount: true,
        avatarUrl: true,
        createdAt: true,
        posts: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            content: true,
            location: true,
            imageUrl: true,
            audioUrl: true,
            telemetry: true,
            createdAt: true,
          },
        },
      },
    });

    if (!targetUser) {
      res.status(404).json({ error: "Investigator profile not found." });
      return;
    }

    const [followersCount, followingCount, followRecord] = await Promise.all([
      prisma.follow.count({ where: { followingId: targetUser.id } }),
      prisma.follow.count({ where: { followerId: targetUser.id } }),
      prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: targetUser.id,
          },
        },
      }),
    ]);

    res.json({
      ...targetUser,
      followersCount,
      followingCount,
      postsCount: targetUser.posts.length,
      isFollowing: !!followRecord,
      isSelf: targetUser.id === currentUserId,
    });
  } catch (error) {
    console.error("Get Public Profile Error:", error);
    res.status(500).json({ error: "Failed to fetch public investigator dossier" });
  }
};

export const getUserFollowers = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = (req as any).user.userId;
    const userId = req.params.userId as string;

    const [viewerFollows, followRecords] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: currentUserId },
        select: { followingId: true },
      }),
      prisma.follow.findMany({
        where: { followingId: userId },
        select: { followerId: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const viewerFollowedIds = new Set(viewerFollows.map((f) => f.followingId));
    const followerIds = followRecords.map((f) => f.followerId);

    const users = await prisma.user.findMany({
      where: { id: { in: followerIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        callsign: true,
        role: true,
        avatarUrl: true,
      },
    });

    const list = users.map((u) => ({
      ...u,
      isFollowing: viewerFollowedIds.has(u.id),
      isSelf: u.id === currentUserId,
    }));

    res.json(list);
  } catch (error) {
    console.error("Get User Followers Error:", error);
    res.status(500).json({ error: "Failed to fetch followers roster" });
  }
};

export const getUserFollowing = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = (req as any).user.userId;
    const userId = req.params.userId as string;

    const [viewerFollows, followRecords] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: currentUserId },
        select: { followingId: true },
      }),
      prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const viewerFollowedIds = new Set(viewerFollows.map((f) => f.followingId));
    const followingIds = followRecords.map((f) => f.followingId);

    const users = await prisma.user.findMany({
      where: { id: { in: followingIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        callsign: true,
        role: true,
        avatarUrl: true,
      },
    });

    const list = users.map((u) => ({
      ...u,
      isFollowing: viewerFollowedIds.has(u.id),
      isSelf: u.id === currentUserId,
    }));

    res.json(list);
  } catch (error) {
    console.error("Get User Following Error:", error);
    res.status(500).json({ error: "Failed to fetch following roster" });
  }
};

export const getConversations = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = (req as any).user.userId;

    const messages = await prisma.message.findMany({
      where: {
        OR: [{ senderId: currentUserId }, { receiverId: currentUserId }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            callsign: true,
            role: true,
            avatarUrl: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            callsign: true,
            role: true,
            avatarUrl: true,
          },
        },
      },
    });

    const conversationsMap = new Map<string, any>();

    for (const msg of messages) {
      const isSender = msg.senderId === currentUserId;
      const partner = isSender ? msg.receiver : msg.sender;
      const partnerId = partner.id;

      if (!conversationsMap.has(partnerId)) {
        conversationsMap.set(partnerId, {
          partner,
          latestMessage: {
            id: msg.id,
            content: msg.content,
            createdAt: msg.createdAt,
            senderId: msg.senderId,
            readAt: msg.readAt,
          },
          unreadCount: 0,
        });
      }

      if (!isSender && !msg.readAt) {
        const convo = conversationsMap.get(partnerId);
        convo.unreadCount += 1;
      }
    }

    const conversations = Array.from(conversationsMap.values());
    res.json(conversations);
  } catch (error) {
    console.error("Get Conversations Error:", error);
    res.status(500).json({ error: "Failed to retrieve conversation threads" });
  }
};

export const getDirectMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = (req as any).user.userId;
    const targetUserId = req.params.userId as string;

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: targetUserId },
          { senderId: targetUserId, receiverId: currentUserId },
        ],
      },
      orderBy: { createdAt: "asc" },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            callsign: true,
          },
        },
      },
    });

    res.json(messages);
  } catch (error) {
    console.error("Get Direct Messages Error:", error);
    res.status(500).json({ error: "Failed to fetch direct messages" });
  }
};

export const markMessagesAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = (req as any).user.userId;
    const senderId = req.params.userId as string;

    const readTimestamp = new Date();

    const result = await prisma.message.updateMany({
      where: {
        senderId,
        receiverId: currentUserId,
        readAt: null,
      },
      data: {
        readAt: readTimestamp,
      },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`user:${senderId}`).emit("messages_read_receipt", {
        readerId: currentUserId,
        readAt: readTimestamp,
      });
    }

    res.json({ updatedCount: result.count, readAt: readTimestamp });
  } catch (error) {
    console.error("Mark Read Error:", error);
    res.status(500).json({ error: "Failed to update message read receipts" });
  }
};

export const sendDirectMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const senderId = (req as any).user.userId;
    const { receiverId, content } = req.body;

    if (!receiverId || !content || !content.trim()) {
      res.status(400).json({ error: "Recipient ID and message content are required." });
      return;
    }

    const message = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        content: content.trim(),
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            callsign: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            callsign: true,
          },
        },
      },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`user:${receiverId}`).emit("new_direct_message", message);
      io.to(`user:${senderId}`).emit("new_direct_message", message);
    }

    res.status(201).json(message);
  } catch (error) {
    console.error("Send Direct Message Error:", error);
    res.status(500).json({ error: "Failed to transmit direct message" });
  }
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;

    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        callsign: true,
        role: true,
        bio: true,
        location: true,
        gearLoadout: true,
        investigationsCount: true,
        createdAt: true,
        posts: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            content: true,
            location: true,
            imageUrl: true,
            audioUrl: true,
            telemetry: true,
            createdAt: true,
          },
        },
      },
    });

    if (!userProfile) {
      res.status(404).json({ error: "User profile not found" });
      return;
    }

    const [followersCount, followingCount] = await Promise.all([
      prisma.follow.count({ where: { followingId: userId } }),
      prisma.follow.count({ where: { followerId: userId } }),
    ]);

    res.json({
      ...userProfile,
      followersCount,
      followingCount,
      postsCount: userProfile.posts.length,
    });
  } catch (error) {
    console.error("Fetch Profile Error:", error);
    res.status(500).json({ error: "Failed to fetch profile data" });
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const {
      username,
      displayName,
      callsign,
      role,
      bio,
      location,
      gearLoadout,
      investigationsCount,
    } = req.body;

    if (username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: username.toLowerCase(),
          NOT: { id: userId },
        },
      });

      if (existingUser) {
        res
          .status(400)
          .json({ error: "That username is already claimed by another investigator." });
        return;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(username && { username: username.toLowerCase().trim() }),
        ...(displayName !== undefined && { displayName: displayName ? displayName.trim() : null }),
        ...(callsign !== undefined && {
          callsign: callsign ? callsign.trim().toUpperCase() : null,
        }),
        ...(role !== undefined && { role: role ? role.trim() : "Field Investigator" }),
        ...(bio !== undefined && { bio }),
        ...(location !== undefined && { location }),
        ...(gearLoadout !== undefined && { gearLoadout }),
        ...(investigationsCount !== undefined && {
          investigationsCount: Number(investigationsCount) || 0,
        }),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        callsign: true,
        role: true,
        bio: true,
        location: true,
        gearLoadout: true,
        investigationsCount: true,
        createdAt: true,
      },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ error: "Failed to update investigator profile" });
  }
};

export const createSquad = async (req: Request, res: Response): Promise<void> => {
  try {
    const leaderId = (req as any).user.userId;
    const { name, callsign, mission } = req.body;

    if (!name || !callsign) {
      res.status(400).json({ error: "Squad name and radio callsign code are required." });
      return;
    }

    const cleanCallsign = callsign.trim().toUpperCase();

    const existing = await prisma.squad.findUnique({
      where: { callsign: cleanCallsign },
    });

    if (existing) {
      res.status(400).json({ error: "That squad callsign code is already active in the field." });
      return;
    }

    const squad = await prisma.squad.create({
      data: {
        name: name.trim(),
        callsign: cleanCallsign,
        mission: mission ? mission.trim() : null,
        leaderId,
        members: {
          create: {
            userId: leaderId,
            role: "Squad Lead",
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                callsign: true,
                role: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json(squad);
  } catch (error) {
    console.error("Create Squad Error:", error);
    res.status(500).json({ error: "Failed to form field squad" });
  }
};

export const getMySquads = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;

    const memberships = await prisma.squadMember.findMany({
      where: { userId },
      include: {
        squad: {
          include: {
            leader: {
              select: {
                id: true,
                username: true,
                displayName: true,
                callsign: true,
              },
            },
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    callsign: true,
                    role: true,
                  },
                },
              },
            },
            _count: {
              select: { members: true, messages: true },
            },
          },
        },
      },
    });

    const squads = memberships.map((m) => m.squad);
    res.json(squads);
  } catch (error) {
    console.error("Get Squads Error:", error);
    res.status(500).json({ error: "Failed to fetch squad affiliations" });
  }
};

export const joinSquadByCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: "Squad callsign code is required." });
      return;
    }

    const cleanCode = code.trim().toUpperCase();

    const squad = await prisma.squad.findUnique({
      where: { callsign: cleanCode },
    });

    if (!squad) {
      res.status(404).json({ error: "No field squad found with that callsign code." });
      return;
    }

    const existingMember = await prisma.squadMember.findUnique({
      where: {
        squadId_userId: {
          squadId: squad.id,
          userId,
        },
      },
    });

    if (existingMember) {
      res.status(400).json({ error: "You are already registered to this field squad." });
      return;
    }

    await prisma.squadMember.create({
      data: {
        squadId: squad.id,
        userId,
        role: "Field Operator",
      },
    });

    // Notify squad channel over Socket.IO
    const io = req.app.get("io");
    const joiningUser = await prisma.user.findUnique({ where: { id: userId } });
    if (io && joiningUser) {
      io.to(`squad:${squad.id}`).emit("squad_member_joined", {
        squadId: squad.id,
        user: {
          id: joiningUser.id,
          username: joiningUser.username,
          displayName: joiningUser.displayName,
          callsign: joiningUser.callsign,
        },
      });
    }

    res.json({ success: true, squadId: squad.id });
  } catch (error) {
    console.error("Join Squad Error:", error);
    res.status(500).json({ error: "Failed to join field squad" });
  }
};

export const getSquadMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const { squadId } = req.params;

    const messages = await prisma.squadMessage.findMany({
      where: { squadId },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            callsign: true,
          },
        },
      },
    });

    res.json(messages);
  } catch (error) {
    console.error("Get Squad Messages Error:", error);
    res.status(500).json({ error: "Failed to retrieve squad dispatch stream" });
  }
};

export const sendSquadMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const senderId = (req as any).user.userId;
    const { squadId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      res.status(400).json({ error: "Transmission content cannot be empty." });
      return;
    }

    const message = await prisma.squadMessage.create({
      data: {
        squadId,
        senderId,
        content: content.trim(),
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            callsign: true,
          },
        },
      },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`squad:${squadId}`).emit("new_squad_message", message);
    }

    res.status(201).json(message);
  } catch (error) {
    console.error("Send Squad Message Error:", error);
    res.status(500).json({ error: "Failed to broadcast squad message" });
  }
};

// Squad Hub Collaboration Controllers

export const getSquadDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { squadId } = req.params;

    const squad = await prisma.squad.findUnique({
      where: { id: squadId },
      include: {
        leader: {
          select: {
            id: true,
            username: true,
            displayName: true,
            callsign: true,
            role: true,
            avatarUrl: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                callsign: true,
                role: true,
                gearLoadout: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        floorplans: {
          orderBy: { createdAt: "desc" },
        },
        planItems: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!squad) {
      res.status(404).json({ error: "Squad not found." });
      return;
    }

    res.json(squad);
  } catch (error) {
    console.error("Get Squad Details Error:", error);
    res.status(500).json({ error: "Failed to fetch squad dossier" });
  }
};

export const updateSquadMission = async (req: Request, res: Response): Promise<void> => {
  try {
    const { squadId } = req.params;
    const { mission, location, huntDate, stagingNotes } = req.body;

    const updated = await prisma.squad.update({
      where: { id: squadId },
      data: {
        ...(mission !== undefined && { mission }),
        ...(location !== undefined && { location }),
        ...(huntDate !== undefined && { huntDate: huntDate ? new Date(huntDate) : null }),
        ...(stagingNotes !== undefined && { stagingNotes }),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Update Squad Error:", error);
    res.status(500).json({ error: "Failed to update squad briefing" });
  }
};

export const uploadSquadFloorplan = async (req: Request, res: Response): Promise<void> => {
  try {
    const { squadId } = req.params;
    const { title } = req.body;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const photoFile = files?.photo?.[0];

    if (!photoFile) {
      res.status(400).json({ error: "Floor plan image file is required." });
      return;
    }

    const imageUrl = `/uploads/${photoFile.filename}`;

    const floorplan = await prisma.squadFloorplan.create({
      data: {
        squadId,
        title: title ? title.trim() : "Site Floor Plan",
        imageUrl,
      },
    });

    res.status(201).json(floorplan);
  } catch (error) {
    console.error("Floorplan Upload Error:", error);
    res.status(500).json({ error: "Failed to upload floor plan" });
  }
};

export const deleteSquadFloorplan = async (req: Request, res: Response): Promise<void> => {
  try {
    const { floorplanId } = req.params;

    await prisma.squadFloorplan.delete({
      where: { id: floorplanId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Delete Floorplan Error:", error);
    res.status(500).json({ error: "Failed to remove floor plan" });
  }
};

export const createSquadPlanItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { squadId } = req.params;
    const { title, phase, assignedTo } = req.body;

    if (!title || !title.trim()) {
      res.status(400).json({ error: "Task title is required." });
      return;
    }

    const item = await prisma.squadPlanItem.create({
      data: {
        squadId,
        title: title.trim(),
        phase: phase || "ACTIVE",
        assignedTo: assignedTo ? assignedTo.trim() : null,
      },
    });

    res.status(201).json(item);
  } catch (error) {
    console.error("Create Plan Item Error:", error);
    res.status(500).json({ error: "Failed to record tactical task" });
  }
};

export const toggleSquadPlanItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;

    const existing = await prisma.squadPlanItem.findUnique({
      where: { id: itemId },
    });

    if (!existing) {
      res.status(404).json({ error: "Task not found." });
      return;
    }

    const updated = await prisma.squadPlanItem.update({
      where: { id: itemId },
      data: { completed: !existing.completed },
    });

    res.json(updated);
  } catch (error) {
    console.error("Toggle Plan Item Error:", error);
    res.status(500).json({ error: "Failed to update task state" });
  }
};

export const deleteSquadPlanItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;

    await prisma.squadPlanItem.delete({
      where: { id: itemId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Delete Plan Item Error:", error);
    res.status(500).json({ error: "Failed to delete task" });
  }
};
