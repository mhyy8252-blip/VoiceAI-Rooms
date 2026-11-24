const routes = new Map();
export function registerRoute(path,render){routes.set(path,render);}
export function navigate(path){location.hash=`/${path}`;}
export function route(){const path=(location.hash.replace(/^#\/?/,"").split("?")[0]||"welcome");return routes.get(path)||routes.get("welcome");}
export function startRouter(){window.addEventListener("hashchange",()=>route()?.());route()?.();}
