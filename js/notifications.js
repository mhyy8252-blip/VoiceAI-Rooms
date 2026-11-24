import {toast} from "./utils.js";
export async function requestNotifications(){if(!("Notification" in window)){toast("الإشعارات غير مدعومة");return;}const permission=await Notification.requestPermission();toast(permission==="granted"?"تم تفعيل الإشعارات":"لم يتم تفعيل الإشعارات");}
