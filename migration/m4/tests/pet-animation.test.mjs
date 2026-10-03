import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {frameAt} from '../../../packages/nidofy/desktop-extras/assets/pet/animation.js';
const manifest=JSON.parse(await readFile(new URL('../../../packages/nidofy/desktop-extras/assets/pets/xiaojing/asset-manifest.json',import.meta.url)));
test('every frame has its declared interval and idle excludes neutral look',()=>{
 for(const a of manifest.animations){let elapsed=0;for(let i=0;i<a.frameCount;i++){assert.equal(frameAt(a,elapsed).column,i);assert.equal(frameAt(a,elapsed+a.durationsMs[i]-1).column,i);elapsed+=a.durationsMs[i];}assert.equal(frameAt(a,elapsed).done,!a.loop);}
 assert.equal(frameAt(manifest.animations[0],1100).column,0);
});
