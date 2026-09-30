import { Request, Response } from "express";
import { prisma } from "../db.js";

export const createPost = async (req: Request, res: Response): Promise<void> => {
  try {
    const { content, telemetry } = req.body;
    const authorId = (req as any).user.userId;

    if (!content && !req.files) {
      res
        .status(400)
        .json({ error: "Post must contain either a transmission log or attached media." });
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
        imageUrl,
        audioUrl,
        telemetry: parsedTelemetry,
        authorId,
      },
      include: {
        author: {
          select: { email: true },
        },
        comments: {
          include: {
            author: { select: { email: true } },
          },
        },
      },
    });

    res.json(newPost);
  } catch (error) {
    console.error("Create Post Error:", error);
    res.status(500).json({ error: "Failed to create post" });
  }
};

export const getFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const posts = await prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: { email: true },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: { email: true },
            },
          },
        },
      },
    });

    res.json(posts);
  } catch (error) {
    console.error("Fetch Feed Error:", error);
    res.status(500).json({ error: "Failed to fetch the feed" });
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
          select: { email: true },
        },
      },
    });

    res.json(newComment);
  } catch (error) {
    console.error("Create Comment Error:", error);
    res.status(500).json({ error: "Failed to create comment" });
  }
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;

    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        createdAt: true,
        posts: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            content: true,
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
