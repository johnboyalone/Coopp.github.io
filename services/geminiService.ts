import { GoogleGenAI, Type } from "@google/genai";
import { Theme, Puzzle } from '../types';

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("ไม่ได้ตั้งค่าตัวแปรสภาพแวดล้อม API_KEY");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// FIX: Removed unsupported `required` fields from schema.
const puzzleSchema = {
  type: Type.OBJECT,
  properties: {
    theme: { type: Type.STRING, enum: Object.values(Theme) },
    story: {
      type: Type.STRING,
      description: "เรื่องสั้นหนึ่งย่อหน้าเพื่อปูเรื่องสำหรับปริศนา",
    },
    solution: {
      type: Type.STRING,
      description: "รหัส 4 หลักสุดท้ายสำหรับไขปริศนา ต้องเป็นตัวเลข 4 หลักเท่านั้น",
    },
    playerA: {
      type: Type.OBJECT,
      properties: {
        objective: {
          type: Type.STRING,
          description: "สิ่งที่ผู้เล่น A ต้องทำ ควรสื่อเป็นนัยว่าต้องการข้อมูลจากผู้เล่น B",
        },
        clues: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "รายการคำใบ้ 2-3 อย่างที่ผู้เล่น A เห็นเท่านั้น ต้องมีข้อมูลที่ผู้เล่น B จำเป็นต้องใช้เพื่อแก้ปริศนาในส่วนของตนเอง เช่น ลำดับของสัญลักษณ์หรือสี",
        },
        interactiveElements: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "รายการวัตถุ 1-2 อย่างที่ผู้เล่น A สามารถโต้ตอบได้ แต่ไม่สามารถแก้ไขได้โดยลำพัง",
        },
      },
    },
    playerB: {
      type: Type.OBJECT,
      properties: {
        objective: {
          type: Type.STRING,
          description: "สิ่งที่ผู้เล่น B ต้องทำ ควรระบุว่าพวกเขาต้องป้อนรหัสสุดท้ายและต้องการข้อมูลจากผู้เล่น A เพื่อหาคำตอบ",
        },
        clues: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "รายการคำใบ้ 2-3 อย่างที่ผู้เล่น B เห็นเท่านั้น ต้องมีกุญแจหรือรหัสสำหรับข้อมูลของผู้เล่น A เช่น โน้ตที่เขียนว่า 'แดง=1, น้ำเงิน=2' หรือ 'สามเหลี่ยม -> 7'",
        },
        interactiveElements: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "รายการวัตถุ 1-2 อย่างที่ผู้เล่น B สามารถโต้ตอบได้ เช่น 'แป้นพิมพ์รหัส 4 หลัก'",
        },
      },
    },
  },
};


export const generatePuzzle = async (theme: Theme): Promise<Puzzle> => {
  const prompt = `สร้างปริศนาแนวร่วมมือ (co-op) ที่ใหม่ ไม่ซ้ำใคร และท้าทาย สำหรับเกมไขปริศนาหาทางออกสำหรับผู้เล่นสองคน ธีมคือ: "${theme}" โดยใช้ภาษาไทยทั้งหมด ทั้งเนื้อเรื่อง คำใบ้ และองค์ประกอบต่างๆ

  ปริศนาจะต้องไม่สมมาตร (asymmetric):
  - ผู้เล่น A ต้องมีข้อมูลที่ผู้เล่น B ต้องการ
  - ผู้เล่น B ต้องมีข้อมูลที่ผู้เล่น A ต้องการ
  - พวกเขาต้องสื่อสารกันนอกเกมเพื่อแบ่งปันข้อมูลนี้
  - คำตอบสุดท้ายต้องเป็นรหัส 4 หลักเท่านั้น

  สร้างปริศนาที่เชื่อมโยงคำใบ้จากผู้เล่นทั้งสองอย่างมีเหตุผลเพื่อไปให้ถึงคำตอบรหัส 4 หลัก ตัวอย่างเช่น ผู้เล่น A เห็นลำดับอัญมณี 4 สี (เช่น 'แดง, เขียว, น้ำเงิน, แดง') และผู้เล่น B พบโน้ตที่ถอดรหัสค่าของแต่ละสี (เช่น 'แดง=5, เขียว=2, น้ำเงิน=9') คำตอบก็จะเป็น 5295 โปรดตรวจสอบให้แน่ใจว่าตรรกะนั้นชัดเจนแต่ไม่โจ่งแจ้งเกินไป
`;

  console.log("Generating puzzle with theme:", theme);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: puzzleSchema,
      temperature: 0.9,
    }
  });

  const jsonText = response.text.trim();
  try {
    const parsedPuzzle = JSON.parse(jsonText) as Puzzle;
    // Validate the solution format
    if (!/^\d{4}$/.test(parsedPuzzle.solution)) {
        console.error("Generated solution is not 4 digits:", parsedPuzzle.solution);
        throw new Error("รูปแบบปริศนาไม่ถูกต้อง: คำตอบต้องเป็นรหัส 4 หลัก");
    }
    return parsedPuzzle;
  } catch(e) {
    console.error("Failed to parse puzzle JSON:", e);
    console.error("Received text:", jsonText);
    throw new Error("ไม่สามารถรับปริศนาที่ถูกต้องจาก AI ได้");
  }
};
