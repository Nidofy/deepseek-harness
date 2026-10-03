import {randomUUID} from 'node:crypto';

export const validPetSession=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id);
const states=new Set(['IDLE','RUNNING','WAITING_PERMISSION','WAITING_INPUT','COMPLETED','CANCELLED','BLOCKED','FAILED','LIMIT_REACHED','INTERRUPTED','UNKNOWN']);
// Contains only a minimal projection. No messages, titles, paths or tool data.
export class PetFeed {
  constructor(now=Date.now,generation=randomUUID()){this.now=now;this.generation=generation;this.revision=0;this.rows=new Map();this.floor=0;}
  accept(id,state,seq,{live=false,subagent=false,event}={}){
    if(!validPetSession(id)||!Number.isSafeInteger(seq)||!states.has(state.status))return;
    const old=this.rows.get(id);if(old&&seq<old.seq)return;
    if(old&&seq===old.seq&&old.status===state.status)return;
    const reaction=live&&event?.type==='turn/end'&&!subagent?{completed:'jumping',error:'failed'}[event.data?.reason?.kind]:live&&event?.type==='turn/start'?'waving':null;
    const unchanged=old&&old.status===state.status&&old.turn===(state.turn??null);
    const row={sessionId:id,seq,turn:state.turn??null,status:state.status,revision:++this.revision,source:live?'live':'snapshot',notify:unchanged?old.notify:live&&!subagent,reaction:reaction??null,at:unchanged?old.at:this.now()};
    this.rows.delete(id);this.rows.set(id,row);
    if(this.rows.size>32){this.rows.delete(this.rows.keys().next().value);this.floor=this.revision;}
  }
  snapshot(after=0,generation=this.generation){const full=!Number.isSafeInteger(after)||after<=this.floor||after>this.revision||generation!==this.generation;return {generation:this.generation,revision:this.revision,full,items:[...this.rows.values()].filter(r=>full||r.revision>after)};}
}
