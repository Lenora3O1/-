const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

/**
 * 將 submission 的資料套入指定的 .docx 範本，產生合併後的 Word 檔案。
 * 範本內請使用 {{欄位代碼}} 作為佔位符，欄位代碼請對照 config/questions.json 的 id。
 *
 * @param {string} templatePath  範本檔案的絕對路徑 (.docx)
 * @param {object} data          key-value 物件，key 為欄位代碼
 * @returns {Buffer}             產生好的 docx 檔案內容 (Buffer)，可直接寫檔或當作下載內容回傳
 */
function generateDocx(templatePath, data) {
  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '', // 範本裡有欄位但這筆資料沒填時，顯示空白而不是報錯
  });

  doc.render(data);

  return doc.getZip().generate({ type: 'nodebuffer' });
}

module.exports = { generateDocx };
