import { promises as fs } from "fs";
import { State } from ".";
import logger from "../util/logger";
import * as filePath from "path";

/**
 *
 */
export class Disk implements State {
  public basePath: string;
  /**
   *
   * @param {string} basePath
   */
  constructor({ basePath }: { basePath: string }) {
    this.basePath = basePath;
  }
  /**
   *
   * @param {string} path
   * @return {boolean}
   */
  public async objExists(path: string) {
    try {
      await fs.access(filePath.join(this.basePath, path));
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   *
   * @param {string} path
   * @return {boolean}
   */
  public async getObject(path: string) {
    try {
      return await fs.readFile(filePath.join(this.basePath, path), "utf8");
    } catch (e) {
      logger.error(e.message);
      throw new Error("Unable to getObject.");
    }
  }

  /**
   *
   * @param {string} path
   * @param {string} body
   * @return {void}
   */
  public async putObject(path: string, body: string) {
    try {
      await this.mkPath(path);
      await fs.writeFile(filePath.join(this.basePath, path), body);
      return;
    } catch (e) {
      logger.error(e);
      throw new Error("Unable to putObject.");
    }
  }
  /**
   *
   * @param {string} path
   * @param {string} body
   * @return {void}
   */
  public async appendObject(path: string, body: string) {
    try {
      await this.mkPath(path);
      await fs.appendFile(filePath.join(this.basePath, path), body);
      return;
    } catch (e) {
      logger.error(e);
      throw new Error("Unable to putObject.");
    }
  }
  /**
   *
   * @param {string} path
   */
  private async mkPath(path: string) {
    const x = path.split(filePath.sep);
    x.pop();
    const pathWithNoFile = x.join(filePath.sep);
    await fs.mkdir(filePath.join(this.basePath, pathWithNoFile), {
      recursive: true,
    });
  }
}
