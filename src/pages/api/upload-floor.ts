import fs from "fs/promises";
import multer from "multer";
import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import path from "path";
import { v4 as uuid } from "uuid";

type ResponseData =
  | {
      url: string;
    }
  | {
      error: {
        code: string;
        message: string;
        target?: string;
      };
    };

type RequestData = {
  files: Express.Multer.File[];
};

const uploadFolder = path.join(
  process.cwd(),
  "public",
  "uploads",
  "floor-plans",
);

const router = createRouter<
  NextApiRequest & RequestData,
  NextApiResponse<ResponseData>
>();

const createImage = async (img: Express.Multer.File) => {
  await fs.mkdir(uploadFolder, { recursive: true });
  const fileExtension = path.extname(img.originalname) || ".png";
  const filename = `${uuid()}${fileExtension}`;
  const filepath = path.join(uploadFolder, filename);
  await fs.writeFile(filepath, img.buffer);
  const mimeType = (() => {
    switch (fileExtension.toLowerCase()) {
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".webp":
        return "image/webp";
      case ".gif":
        return "image/gif";
      case ".svg":
        return "image/svg+xml";
      default:
        return "image/png";
    }
  })();
  return {
    url: `data:${mimeType};base64,${img.buffer.toString("base64")}`,
  };
};

router
  // @ts-expect-error No idea why this is failing.
  .use(multer().any())
  .post(async (req, res) => {
    const image = req.files.filter((file) => file.fieldname === "image")[0];
    if (!image) return;

    try {
      return res.json({
        url: (await createImage(image)).url,
      });
    } catch (error) {
      console.error("[upload-floor] Failed to persist floor plan", error);
    }
    return res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong, the administrator has been notified.",
      },
    });
  });

export const config = {
  api: {
    bodyParser: false,
  },
};

export default router.handler();
