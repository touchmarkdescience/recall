// Guard asynchronous reads against optimistic writes, older responses and account
// changes. No account data is cached or stored outside the current app session.
export class WriteGuard {
  private scope=0;
  private revision=0;
  private active=new Set<string>();
  read(){return {scope:this.scope,revision:this.revision}}
  canApply(read:{scope:number;revision:number}){return this.current(read)&&read.revision===this.revision&&this.active.size===0}
  current(token:{scope:number}){return token.scope===this.scope}
  begin(key:string){
    if(this.active.has(key))return null;
    this.active.add(key);this.revision++;
    return {scope:this.scope,key};
  }
  finish(token:{scope:number;key:string}){
    if(!this.current(token))return false;
    if(!this.active.delete(token.key))return false;
    this.revision++;
    return true;
  }
  get pending(){return this.active.size}
  reset(){this.scope++;this.revision++;this.active.clear()}
}

export function upsertRows<T extends {id:string}>(rows:T[],incoming:T[]){
  const changes=new Map(incoming.map(row=>[row.id,row]));
  return [...rows.map(row=>{const next=changes.get(row.id);changes.delete(row.id);return next?{...row,...next}:row}),...changes.values()];
}
