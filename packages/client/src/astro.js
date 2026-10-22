import companionPreview from '@atelier/workbench/astro';
export default function atelier({enabled=true}={}){
 if(!enabled)return {name:'atelier-disabled'};
 return companionPreview();
}
