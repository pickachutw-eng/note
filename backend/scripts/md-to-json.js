const fs = require('fs');
const path = require('path');

function mdToJson(mdFilePath) {
    const content = fs.readFileSync(mdFilePath, 'utf-8');
    const lines = content.split('\n');
    const jsonResult = {
        title: '',
        content: '',
    };

    // Assuming the first line is the title.
    if (lines.length > 0) {
        jsonResult.title = lines[0].replace(/^#\s*/, '');
        jsonResult.content = lines.slice(1).join('\n');
    }

    return jsonResult;
}

// Example usage:
// const json = mdToJson('example.md');
// console.log(JSON.stringify(json, null, 2));

module.exports = mdToJson;