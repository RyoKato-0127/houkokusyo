// =============================================
// ★★★ 以下の3つを書き換えてください ★★★
// =============================================
const GEMINI_API_KEY = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // Gemini APIキー
const NOTION_API_KEY = 'ntn_xxxxxxxxxxxxxxxxxxxxx';         // Notion APIキー
const DATABASE_ID = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';     // NotionデータベースID

// =============================================
// メイン処理
// =============================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === 'generate') {
      // 報告書生成
      const report = generateReport(data);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, report: report }))
        .setMimeType(ContentService.MimeType.JSON);
        
    } else if (action === 'save') {
      // Notion保存
      saveToNotion(data);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
        
    } else if (action === 'extract') {
      // 画像からテキスト抽出
      const text = extractTextFromImage(data.imageBase64, data.mediaType);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, text: text }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// CORS対応
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============================================
// 報告書生成（Gemini API）
// =============================================

function generateReport(data) {
  const staffType = data.staffType;
  const patientName = data.patientName || '';
  const reportMonth = data.reportMonth || '';
  const inputText = data.rawRecords || '';
  
  const isRehab = ['理学療法士', '作業療法士', '言語聴覚士'].includes(staffType);
  
  const nursePrompt = `あなたは訪問看護ステーションの熟練した看護師です。以下の日々の記録情報から、訪問看護報告書の「病状の経過」欄に記載する文章を作成してください。

【患者情報】
${patientName ? '氏名: ' + patientName : ''}
報告月: ${reportMonth}

【日々の記録・観察事項】
${inputText}

【作成のポイント】
1. 問題リスト（#1, #2, #3...）形式で整理
2. 客観的な観察事項を含める
3. 医師やケアマネジャーが状態を把握しやすい簡潔な文章
4. 前月との比較や変化があれば記載
5. 家族の介護状況や精神的負担にも言及
6. バイタルサインは記載不要（別システムで入力するため）

報告書の「病状の経過」欄の文章のみを出力してください。`;

  const rehabPrompt = `あなたは訪問看護ステーションの熟練した${staffType}です。以下の日々の記録情報から、訪問看護報告書の「病状の経過」欄に記載する文章を作成してください。

【患者情報】
${patientName ? '氏名: ' + patientName : ''}
報告月: ${reportMonth}
担当職種: ${staffType}

【日々の記録・観察事項】
${inputText}

【作成のポイント】
1. リハビリテーションの視点から問題リスト（#1, #2, #3...）形式で整理
2. 機能面の評価・変化（ROM、筋力、バランス、ADL、IADL、嚥下機能、コミュニケーション能力など該当するもの）
3. 実施したリハビリ内容と患者の反応
4. 目標に対する進捗状況
5. 自主トレーニングの実施状況と指導内容
6. 生活上の課題や環境調整の提案があれば記載
7. 医師やケアマネジャーが状態を把握しやすい簡潔な文章
8. バイタルサインは記載不要（別システムで入力するため）

報告書の「病状の経過」欄の文章のみを出力してください。`;

  const prompt = isRehab ? rehabPrompt : nursePrompt;
  
  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1500
    }
  };
  
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_API_KEY;
  
  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());
  
  if (result.error) {
    throw new Error(result.error.message);
  }
  
  if (result.candidates && result.candidates[0] && result.candidates[0].content) {
    return result.candidates[0].content.parts[0].text;
  }
  
  throw new Error('レスポンスの解析に失敗しました');
}

// =============================================
// 画像からテキスト抽出（Gemini API）
// =============================================

function extractTextFromImage(imageBase64, mediaType) {
  const payload = {
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: mediaType || 'image/jpeg',
            data: imageBase64
          }
        },
        {
          text: 'この画像は訪問看護の記録です。画像内のテキストをすべて正確に文字起こししてください。日付、患者の状態・症状、実施したケア内容、観察事項、家族からの訴えを特に注意して読み取ってください。読み取ったテキストのみを出力してください。'
        }
      ]
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2000
    }
  };
  
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_API_KEY;
  
  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());
  
  if (result.error) {
    throw new Error(result.error.message);
  }
  
  if (result.candidates && result.candidates[0] && result.candidates[0].content) {
    return result.candidates[0].content.parts[0].text;
  }
  
  throw new Error('テキスト抽出に失敗しました');
}

// =============================================
// Notion保存
// =============================================

function saveToNotion(data) {
  const notionData = {
    parent: { database_id: DATABASE_ID },
    properties: {
      "名前": {
        title: [{
          text: { content: (data.patientName || '患者') + ' - ' + data.reportMonth }
        }]
      },
      "報告月": {
        date: { start: data.reportMonth + '-01' }
      },
      "患者名": {
        rich_text: [{ text: { content: data.patientName || '' } }]
      },
      "職種": {
        select: { name: data.staffType }
      },
      "作成者": {
        rich_text: [{ text: { content: data.staffName || '' } }]
      },
      "作成日": {
        date: { start: new Date().toISOString().split('T')[0] }
      }
    },
    children: [
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: "病状の経過" } }]
        }
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: data.generatedReport || '' } }]
        }
      },
      {
        object: "block",
        type: "divider",
        divider: {}
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: "元記録" } }]
        }
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: data.rawRecords || '' } }]
        }
      }
    ]
  };

  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + NOTION_API_KEY,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    payload: JSON.stringify(notionData),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch('https://api.notion.com/v1/pages', options);
  const result = JSON.parse(response.getContentText());
  
  if (result.error) {
    throw new Error(result.error.message);
  }
  
  return result;
}
