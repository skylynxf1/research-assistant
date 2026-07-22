import type { UIAgentEvent, UIAgentEventType } from "./types";
const eventName = "marginalia-ui-agent-event";
export function emitUIAgentEvent(type: UIAgentEventType, detail: Omit<UIAgentEvent,"type"|"timestamp"> = {}): UIAgentEvent { const event={type,timestamp:Date.now(),...detail} as UIAgentEvent; if(typeof window!=="undefined") window.dispatchEvent(new CustomEvent(eventName,{detail:event})); return event; }
export function subscribeUIAgent(listener:(event:UIAgentEvent)=>void):()=>void { if(typeof window==="undefined") return ()=>undefined; const handler=(e:Event)=>listener((e as CustomEvent<UIAgentEvent>).detail); window.addEventListener(eventName,handler); return ()=>window.removeEventListener(eventName,handler); }
