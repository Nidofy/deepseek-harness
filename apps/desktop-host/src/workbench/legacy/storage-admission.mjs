/** Host storage reservations replace the legacy Tauri pipe. */
import {statfs,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
const volumes=new Map();
export class StorageAdmissionError extends Error {constructor(code){super(code);this.code=code;}}
export const storageAdmission={
  async acquire(path,bytes,{signal}={}){
    signal?.throwIfAborted();
    if(!Number.isSafeInteger(bytes)||bytes<1||bytes>1024**3)throw new StorageAdmissionError('STORAGE_RESERVATION_INVALID');
    await mkdir(path,{recursive:true});
    const info=await statfs(path),key=resolve(path).split(/[\\/]/)[0],reserved=volumes.get(key)||0;
    if(info.bavail*info.bsize-reserved-bytes<64*1024*1024)throw new StorageAdmissionError('STORAGE_QUOTA_UNAVAILABLE');
    volumes.set(key,reserved+bytes);let released=false;
    return {run:work=>{if(released)throw new StorageAdmissionError('STORAGE_RESERVATION_EXPIRED');return work();},release:async()=>{if(!released){released=true;volumes.set(key,(volumes.get(key)||0)-bytes);}}};
  },
  async write(path,bytes,work){const lease=await this.acquire(dirname(path),bytes);try{return await lease.run(work);}finally{await lease.release();}}
};
