const fs = require('fs');
const path = require('path');

// 建議安裝 npm install gray-matter 處理這部分，或者用簡單的正則表達式
function mdToJson(mdFilePath) {
    const content = fs.readFileSync(mdFilePath, 'utf-8');
    
    // 使用正則表達式切分 Frontmatter (--- 之間的內容) 與 內文
    const parts = content.split('---');
    if (parts.length < 3) return null; // 格式不符就跳過

    const yaml = parts[1];
    const card = {};
    
    // 解析 Frontmatter 欄位
    yaml.split('\n').forEach(line => {
        const [key, ...val] = line.split(':');
        if (key && val.length > 0) {
            const value = val.join(':').trim();
            // 處理陣列格式如 links: [A, B]
            if (value.startsWith('[') && value.endsWith(']')) {
                card[key.trim()] = value.slice(1, -1).split(',').map(s => s.trim()).filter(s => s);
            } else {
                card[key.trim()] = value;
            }
        }
    });

    return card; 
    // 這裡不回傳 content，讓 db.json 保持輕量
    // 內文等網頁端需要時，再透過卡片的 id 去抓對應的 .md 檔
}
