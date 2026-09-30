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

    res.json({
      ...newPost,
      likeCount: newPost._count.likes,
      commentCount: newPost._count.comments,
      isLiked: false,
    });
  } catch (error) {
    console.error("Create Post Error:", error);
    res.status(500).json({ error: "Failed to create post" });
  }
};

export const getFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = (req as any).user.userId;

    const posts = await prisma.post.findMany({
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
    }));

    res.json(formattedPosts);
  } catch (error) {
    console.error("Fetch Feed Error:", error);
    res.status(500).json({ error: "Failed to fetch the feed" });
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

    res.json(newComment);
  } catch (error) {
    console.error("Create Comment Error:", error);
    res.status(500).json({ error: "Failed to create comment" });
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

    res.status(201).json(message);
  } catch (error) {
    console.error("Send Direct Message Error:", error);
    res.status(500).json({ error: "Failed to transmit direct message" });
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

    res.json(userProfile);
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
