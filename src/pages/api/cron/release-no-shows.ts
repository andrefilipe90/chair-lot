import type { NextApiRequest, NextApiResponse } from "next";

import { releaseExpiredDeskSchedules } from "../../../server/jobs/releaseExpiredDeskSchedules";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    const providedSecret =
      req.headers["x-cron-secret"] ?? req.query.token ?? "";
    if (providedSecret !== expectedSecret) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  }

  try {
    const releasedCount = await releaseExpiredDeskSchedules();
    return res.status(200).json({ released: releasedCount });
  } catch (error) {
    return res.status(500).json({ message: "Failed to release reservations" });
  }
};

export default handler;
