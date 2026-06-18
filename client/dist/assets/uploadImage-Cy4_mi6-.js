import{i as u,q as p}from"./index-BhDgRVcx.js";/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m=u("loader-circle",[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]]);async function n(t,c){const e=new FormData;return e.append("image",t),(await p.post("/images"+(c?`?type=${c}`:""),e,{headers:{"Content-Type":"multipart/form-data"}})).data.url}function f(t,c){return new Promise(e=>{const a=document.createElement("input");a.type="file",a.accept="image/*",a.onchange=async()=>{var l;const r=(l=a.files)==null?void 0:l[0];if(!r){e(null);return}t==null||t(!0);try{const s=await n(r,c);e(s)}catch{e(null)}finally{t==null||t(!1)}},a.oncancel=()=>e(null),a.click()})}export{m as L,f as p,n as u};
