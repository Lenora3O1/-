const fs=require('fs');
const path=require('path');
const PizZip=require('pizzip');
const XLSX=require('xlsx');

function cleanText(s){return String(s||'').replace(/\s+/g,' ').trim()}
function xmlText(xml){return cleanText((String(xml||'').match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)||[]).map(x=>x.replace(/<[^>]+>/g,'')).join(''))}
function attr(tag,name){const m=String(tag||'').match(new RegExp(name+'="([^"]*)"'));return m?m[1]:''}
function analyzeDocx(filePath){
  const zip=new PizZip(fs.readFileSync(filePath));
  const doc=zip.file('word/document.xml');
  if(!doc) throw new Error('找不到 Word 文件內容');
  const xml=doc.asText();
  const paragraphs=[];
  for(const m of xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)){
    const t=xmlText(m[0]);
    if(t) paragraphs.push(t);
  }
  const tables=[];
  for(const m of xml.matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g)){
    const tx=m[0]; const rows=[];
    for(const rm of tx.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)){
      const cells=[];
      for(const cm of rm[0].matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)) cells.push(xmlText(cm[0]));
      if(cells.some(Boolean)) rows.push(cells);
    }
    if(rows.length) tables.push({rows:rows.length,columns:Math.max(...rows.map(r=>r.length)),preview:rows.slice(0,8)});
  }
  const images=(xml.match(/<a:blip\b/g)||[]).length;
  const headings=paragraphs.filter(t=>/^(一、|二、|三、|四、|五、|六、|七、|八、|九、|十、)|(工作日誌|工作紀錄|工作記錄|施工|表計|水表|電表|人員|待辦|照片|修繕|概況)/.test(t)).slice(0,60);
  return {type:'docx',fileName:path.basename(filePath),paragraphCount:paragraphs.length,tableCount:tables.length,imageCount:images,headings,tables};
}
function analyzeXlsx(filePath){
  const wb=XLSX.readFile(filePath,{cellFormula:true,cellNF:true,cellStyles:true,cellDates:true});
  const sheets=wb.SheetNames.map(name=>{
    const ws=wb.Sheets[name]; const range=XLSX.utils.decode_range(ws['!ref']||'A1');
    const cells=[]; let formulas=0;
    for(let r=range.s.r;r<=range.e.r;r++) for(let c=range.s.c;c<=range.e.c;c++){
      const addr=XLSX.utils.encode_cell({r,c}); const cell=ws[addr];
      if(!cell) continue;
      const item={address:addr,value:cell.v??null,display:cell.w??null,type:cell.t||null};
      if(cell.f){item.formula=cell.f;formulas++;}
      cells.push(item);
    }
    const rows=[];
    for(let r=range.s.r;r<=Math.min(range.e.r,r+30);r++){
      const row=[]; for(let c=range.s.c;c<=range.e.c;c++){const cell=ws[XLSX.utils.encode_cell({r,c})];row.push(cell?{value:cell.v??null,formula:cell.f||null}:null)}
      rows.push(row);
    }
    return {name,range:ws['!ref']||'A1',rows:range.e.r-range.s.r+1,columns:range.e.c-range.s.c+1,formulaCount:formulas,cells,preview:rows.slice(0,12)};
  });
  return {type:'xlsx',fileName:path.basename(filePath),sheetCount:sheets.length,sheets};
}
function analyzeTemplate(filePath){
  const ext=path.extname(filePath).toLowerCase();
  if(ext==='.docx') return analyzeDocx(filePath);
  if(ext==='.xlsx' || ext==='.xlsm') return analyzeXlsx(filePath);
  throw new Error('目前只支援 .docx、.xlsx、.xlsm');
}
module.exports={analyzeTemplate};
