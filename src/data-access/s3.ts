import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { State } from '../data-access';
import { streamToString } from '../util/stream';
import logger from '../util/logger';

const client = new S3Client({ region: '<REGION>' });

/**
 *
 */
export class S3 implements State {
  /**
   *
   */
  public Bucket: string;
  /**
   * @param {string} Bucket
   */
  constructor({ Bucket }: { Bucket: string }) {
    this.Bucket = Bucket;
  }

  /**
   *
   * @param {string} path
   */
  public async objExists(path: string) {
    try {
      const command = new HeadObjectCommand({ Key: path, Bucket: this.Bucket });
      await client.send(command);
      return true;
    } catch (e) {
      logger.error(e.message);
      return false;
    }
  }
  /**
   *
   * @param {string} path
   */
  public async getObject(path: string) {
    try {
      const command = new GetObjectCommand({ Key: path, Bucket: this.Bucket });
      const obj = await client.send(command);
      return streamToString(obj.Body);
    } catch (e) {
      logger.error(e.message);
      throw new Error('Unable to getObject.');
    }
  }

  /**
   * @param {string} path
   * @param {string} body
   */
  public async putObject(path: string, body: string) {
    logger.info(`Putting object s3:${this.Bucket}/${path}`);
    try {
      const command = new PutObjectCommand({
        Key: path,
        Bucket: this.Bucket,
        Body: body,
        ContentType: 'application/json',
      });
      await client.send(command);
      return;
    } catch (e) {
      logger.error(e);
      throw new Error('Unable to putObject.');
    }
  }

  /**
   * NOTE: S3 has no native append function.
   * @param {string} path
   * @param {string} body
   */
  public async appendObject(path: string, body: string) {
    try {
      const fileAsString = await this.getObject(path);
      const appendedFileString = fileAsString.concat(body);
      await this.putObject(path, appendedFileString);
      return;
    } catch (e) {
      logger.error(e);
      throw new Error('Unable to putObject.');
    }
  }
}
