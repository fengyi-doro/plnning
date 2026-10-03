const base='http://qdrant:6333';
const path=base+'/collections/trpg_rules';
const current=await fetch(path);
if(current.status===404){
 const r=await fetch(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({vectors:{size:1024,distance:'Cosine'}})});
 if(!r.ok)throw new Error(await r.text());
 console.log('Created trpg_rules');
}else if(!current.ok){throw new Error(await current.text());}
else { console.log('trpg_rules already exists; data retained'); }
