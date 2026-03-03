import Dexie, { type Table } from 'dexie';

export interface LibraryFile {
  id?: number;
  name: string;
  folderId: number | null;
  serverPath: string;
  type: string;
  size: number;
  createdAt: number;
}

export interface Folder {
  id?: number;
  name: string;
  parentId: number | null;
}

export class HarmoniconDB extends Dexie {
  files!: Table<LibraryFile>;
  folders!: Table<Folder>;

  constructor() {
    super('HarmoniconDB');
    this.version(1).stores({
      files: '++id, name, folderId',
      folders: '++id, name, parentId'
    });
  }
}

export const db = new HarmoniconDB();
