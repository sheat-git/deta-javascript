import { promises as fs } from 'fs';

import url from '../constants/url';
import Requests from '../utils/request';
import { isString } from '../utils/string';
import { DriveApi } from '../constants/api';
import { ObjectType } from '../types/basic';
import { PutOptions, ListOptions } from '../types/drive/request';

import {
  GetResponse,
  PutResponse,
  ListResponse,
  UploadResponse,
  DeleteResponse,
  DeleteManyResponse,
} from '../types/drive/response';

export default class Drive {
  private requests: Requests;

  /**
   * Drive constructor
   *
   * @param {string} projectKey
   * @param {string} driveName
   */
  constructor(projectKey: string, driveName: string) {
    const baseURL = url.DRIVE_HOST_URL.replace(':drive_name', driveName);
    this.requests = new Requests(projectKey, baseURL);
  }

  /**
   * get file from drive
   *
   * @param {string} name
   * @returns {Promise<GetResponse>}
   */
  public async get(name: string): Promise<GetResponse> {
    const trimedName = name.trim();
    if (!trimedName.length) {
      throw new Error('Name is empty');
    }

    const encodedName = encodeURIComponent(trimedName);

    const { status, response, error } = await this.requests.get(
      DriveApi.GET_FILE.replace(':name', encodedName)
    );
    if (status === 404 && error) {
      return null;
    }

    if (error) {
      throw error;
    }

    return response;
  }

  /**
   * delete file from drive
   *
   * @param {string} name
   * @returns {Promise<DeleteResponse>}
   */
  public async delete(name: string): Promise<DeleteResponse> {
    const trimedName = name.trim();
    if (!trimedName.length) {
      throw new Error('Name is empty');
    }

    const payload: ObjectType = {
      names: [name],
    };

    const { response, error } = await this.requests.delete(
      DriveApi.DELETE_FILES,
      payload
    );
    if (error) {
      throw error;
    }

    return response?.deleted?.[0] || name;
  }

  /**
   * deleteMany file from drive
   *
   * @param {string[]} names
   * @returns {Promise<DeleteManyResponse>}
   */
  public async deleteMany(names: string[]): Promise<DeleteManyResponse> {
    if (!names.length) {
      throw new Error("Names can't be empty");
    }

    if (names.length > 1000) {
      throw new Error("We can't delete more than 1000 items at a time");
    }

    const payload: ObjectType = {
      names,
    };

    const { status, response, error } = await this.requests.delete(
      DriveApi.DELETE_FILES,
      payload
    );

    if (status === 400 && error) {
      throw new Error("Names can't be empty");
    }

    if (error) {
      throw error;
    }

    return response;
  }

  /**
   * list files from drive
   *
   * @param {ListOptions} [options]
   * @returns {Promise<ListResponse>}
   */
  public async list(options?: ListOptions): Promise<ListResponse> {
    const { prefix = '', limit = 1000, last = '' } = options || {};

    const { response, error } = await this.requests.get(
      DriveApi.LIST_FILES.replace(':prefix', prefix)
        .replace(':limit', limit.toString())
        .replace(':last', last)
    );
    if (error) {
      throw error;
    }

    return response;
  }

  /**
   * put files on drive
   *
   * @param {string} name
   * @param {PutOptions} options
   * @returns {Promise<PutResponse>}
   */
  public async put(name: string, options: PutOptions): Promise<PutResponse> {
    const trimedName = name.trim();
    if (!trimedName.length) {
      throw new Error('Name is empty');
    }

    const encodedName = encodeURIComponent(trimedName);

    if (options.path && options.data) {
      throw new Error('Please only provide data or a path. Not both');
    }

    if (!options.path && !options.data) {
      throw new Error('Please provide data or a path. Both are empty');
    }

    let buffer = Buffer.from('');

    if (options.path) {
      buffer = await fs.readFile(options.path);
    }

    if (options.data) {
      buffer = isString(options.data)
        ? Buffer.from(options.data as string, 'utf-8')
        : (options.data as Buffer);
    }

    const { response, error } = await this.upload(
      encodedName,
      buffer,
      options.contentType || 'binary/octet-stream'
    );
    if (error) {
      throw error;
    }

    return response as string;
  }

  /**
   * upload files on drive
   *
   * @param {string} name
   * @param {Buffer} data
   * @param {string} contentType
   * @returns {Promise<UploadResponse>}
   */
  private async upload(
    name: string,
    data: Buffer,
    contentType: string
  ): Promise<UploadResponse> {
    const contentLength = data.byteLength;
    const chunkSize = 1024 * 1024 * 100; // 100MB

    const { response, error } = await this.requests.post(
      DriveApi.INIT_CHUNK_UPLOAD.replace(':name', name)
    );
    if (error) {
      return { error };
    }

    const { upload_id: uid } = response;

    let part = 1;
    for (let idx = 0; idx < contentLength; idx += chunkSize) {
      const start = idx;
      const end = Math.min(idx + chunkSize, contentLength);

      const chunk = data.slice(start, end);
      const { error: err } = await this.requests.post(
        DriveApi.UPLOAD_FILE_CHUNK.replace(':uid', uid)
          .replace(':name', name)
          .replace(':part', part.toString()),
        chunk,
        {
          'Content-Type': contentType,
        }
      );
      if (err) {
        return { error: err };
      }

      part += 1;
    }

    const { error: err } = await this.requests.patch(
      DriveApi.COMPLETE_FILE_UPLOAD.replace(':uid', uid).replace(':name', name)
    );
    if (err) {
      return { error: err };
    }

    return { response: name };
  }
}
