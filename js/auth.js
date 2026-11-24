import {AppState} from "./state.js";
import {uid} from "./utils.js";
export function login(username,avatar="م"){const user={id:uid("usr"),username:username.trim(),avatar,role:"user",status:"online",isMuted:false,handRaised:false};AppState.set("user",user);AppState.log("login",user.username);return user;}
export function logout(){AppState.set("user",null);AppState.set("activeRoomId",null);location.hash="#/welcome";}
