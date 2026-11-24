const KEY = "voiceai.rooms.state.v1";
const defaults = {
  user: null, language: "ar", activeRoomId: null,
  rooms: [
    {id:"room-tech",name:"عالم التقنية",description:"نقاشات تقنية وابتكارات يومية",icon:"💻",type:"public",maxUsers:50,aiEnabled:true,users:8,isActive:true},
    {id:"room-night",name:"سهرات هادئة",description:"مساحة لطيفة للتعارف والحديث",icon:"🌙",type:"public",maxUsers:30,aiEnabled:false,users:12,isActive:true},
    {id:"room-ai",name:"مختبر الذكاء الاصطناعي",description:"تجارب وأفكار مع المساعد الذكي",icon:"🤖",type:"ai",maxUsers:50,aiEnabled:true,users:5,isActive:true},
    {id:"room-music",name:"موسيقى ومزاج",description:"شاركنا ما تحب الاستماع إليه",icon:"🎧",type:"public",maxUsers:40,aiEnabled:false,users:3,isActive:true}
  ],
  messages: {}, favorites: [], aiSettings: {
    provider:"google",model:"gemini-2.0-flash",keys:{google:"",openai:"",anthropic:""},
    systemPrompt:"مساعد ودود في غرف صوتية. ردود قصيرة، عربي/إنجليزي.",maxTokens:1000,temperature:0.7,showFallbackNotice:true
  },
  adminPassword:"admin2024", adminAuthenticated:false, logs:[]
};
let state;
try { state = {...defaults,...JSON.parse(localStorage.getItem(KEY)||"{}")}; } catch { state = structuredClone(defaults); }
export const AppState = {
  get(key){ return state[key]; },
  set(key,value){ state[key]=value; this.persist(); },
  update(patch){ state={...state,...patch}; this.persist(); },
  persist(){ localStorage.setItem(KEY,JSON.stringify(state)); },
  snapshot(){ return structuredClone(state); },
  log(action,detail=""){ state.logs.unshift({time:new Date().toISOString(),action,detail}); state.logs=state.logs.slice(0,500); this.persist(); }
};
export const DEFAULT_AI_SETTINGS = defaults.aiSettings;
