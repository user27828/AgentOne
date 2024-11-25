/**
 * <HTTP METHOD> /finetune/*
 * Fine tuning for Ollama models
 */
import { Router, Request, Response, NextFunction } from "express";
import fs from "fs-extra";
import path from "path";
import mime from "mime-types";
import _, {
  countBy,
  flatten,
  get,
  map,
  omit,
  uniq,
  uniqBy,
  keyBy,
  size,
  intersection,
  sampleSize,
} from "lodash";

const router = Router();

/**
 * Default
 */
router.get("/", (req, res) => {
  res.json({ data: "Hello /finetuneUniverse!1" });
});

export default router;
