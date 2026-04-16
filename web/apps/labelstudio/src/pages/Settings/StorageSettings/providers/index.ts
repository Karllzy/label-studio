import localFilesProvider from "./localFiles";
import redisProvider from "./redis";
import { s3Provider } from "./s3";

export const providers = {
  localfiles: localFilesProvider,
  s3: s3Provider,
  redis: redisProvider,
};
