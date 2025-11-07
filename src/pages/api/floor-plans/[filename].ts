import fs from "fs/promises";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

const uploadDir = path.join(process.cwd(), "public", "uploads", "floor-plans");

const mediaTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

const allowedExtensions = new Set(Object.keys(mediaTypes));

const sendNotFound = (res: NextApiResponse) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Floor plan not found.",
    },
  });
};

const sanitizeFileName = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  if (/[\\/]/.test(raw) || raw.includes("..")) {
    return null;
  }
  return raw;
};

const getContentType = (filename: string) => {
  const ext = path.extname(filename).toLowerCase();
  if (!allowedExtensions.has(ext)) return null;
  return mediaTypes[ext];
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Only GET is supported for floor plan assets.",
      },
    });
  }

  const filename = sanitizeFileName(req.query.filename);
  if (!filename) {
    return sendNotFound(res);
  }

  const contentType = getContentType(filename);
  if (!contentType) {
    return sendNotFound(res);
  }

  const filePath = path.join(uploadDir, filename);

  try {
    const data = await fs.readFile(filePath);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).send(data);
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return sendNotFound(res);
    }

    console.error("[floor-plans] Failed to read floor plan", error);
    return res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong, the administrator has been notified.",
      },
    });
  }
};

export default handler;
