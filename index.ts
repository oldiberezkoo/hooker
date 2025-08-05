//
export * from "./src/main";
export * from "./src/types";
export * from "./src/utils/logger";
export * from "./src/utils/crypto";
export * from "./src/utils/fileSystem";
export * from "./src/deobfuscation";
export * from "./src/beautification";
export * from "./src/parsing/dependencies";
export * from "./src/runtime/analyzer";
export * from "./src/runtime/instrumentation";
export * from "./src/architecture/analyzer";
export * from "./src/ollama/client";
export * from "./src/documentation/generator";
//
import { resolve } from "path";
import { eLanguage } from "./src/types";
//

/* --------  ↑ -------- */
/* ----  SETTINGS  ---- */
/* ---- ---- ↓ -------- */

/**
 * Абсолютный путь к директории с проектами, откуда будут браться референсы для анализа.
 * Используется как корневая папка для поиска и обработки проектов.
 *
 * @type {string}
 * @default resolve(process.cwd(), "examples")
 *
 * @description [RU] Абсолютный путь к директории с проектами для анализа.
 * @description [EN] Absolute path to the directory with projects to be used as references for analysis.
 * Used as the root folder for searching and processing projects.
 */
export var ROOT = resolve(process.cwd(), "examples");

/**
 * Язык, на котором ИИ будет формировать ответы в документации (человеческий язык).
 * Определяет, на каком языке будут написаны пояснения и комментарии в сгенерированных документах.
 *
 * Возможные значения:
 *  - "English": Английский
 *  - "Russian": Русский
 *  - и другие коды языков (например, "fr", "de" и т.д.)
 *
 * @type {eLanguage}
 * @default eLanguage.English
 *
 * @description [RU] Язык, на котором ИИ будет формировать ответы в документации.
 * @description [EN] The language in which the AI will generate documentation responses (human language).
 * Determines the language for explanations and comments in generated documents.
 */
export var LANGUAGE = eLanguage.English;

/**
 * Генерирует промпт для анализа исходного кода.
 *
 * @param {string} code - Исходный код для анализа.
 * @returns {string} Сформированный промпт для ИИ.
 *
 * @description [RU] Функция возвращает промпт для глубокого анализа и документирования исходного файла.
 * @description [EN] Generates a prompt for deep analysis and documentation of the given source file.
 */
export var PROMPT = (code: string): string => {
  const prompt = `
You are a lead expert in reverse engineering and JavaScript/TypeScript source code analysis.
Your task is to perform a deep, accurate, and professional examination of the given file for auditing, documentation, and architectural understanding.

Use the strictly structured template below. Fill each section with detailed explanations, examples, and code excerpts.

1. **General Purpose and Architecture**  
   - Describe the business logic or user scenario addressed by the file.  
   - Specify the main architectural patterns (modules, layers, asynchronous patterns via async/await or generators).  
   - **Example:**  
     > This module handles tracking of video item impressions and clicks.  
     > - Implements the Command pattern for event dispatch.  
     > - Main export is \`trackEvent(eventType: string, payload: Payload): Promise<void>\`.  
     > - Asynchronous queue is implemented with generators:  
     >   \`\`\`ts
     >   export function* sendQueue(): Generator<Promise<void>, void, unknown> {
     >     for (const item of queue) {
     >       yield api.send(item);
     >     }
     >   }
     >   \`\`\`

2. **Input and Output Data**  
   - List all public functions, their signatures, expected arguments, and return types.  
   - Specify what data GraphQL queries accept and what they return.  
   - **Example:**  
     \`\`\`ts
     /**
      * @param id — unique video identifier
      * @returns Promise<{ ownerId: string; duration: number; }>
      */
     export async function fetchVideoMeta(id: string): Promise<VideoMeta> { /* ... */ }
     \`\`\`

3. **Dependencies**  
   - Enumerate external packages (\`graphql-request\`, \`lodash\`, \`moment\`, etc.) and their roles.  
   - List internal modules and types, including their import origins.  
   - **Example table:**

     | Module                         | Purpose                                |
     |--------------------------------|----------------------------------------|
     | \`import { gql }\`               | Constructs GraphQL queries             |
     | \`import { errorLog }\`          | Universal error logger                 |

4. **Side Effects and Environment Interaction**  
   - Describe network calls (API, WebSocket), access to localStorage/sessionStorage.  
   - Note usage of global variables, DOM manipulation, cookies, etc.  
   - **If none:** "No side effects present in this file."

5. **Key Algorithms and Logic**  
   - Break down the most non-trivial parts by subitems:  
     - Tracking (impressions, clicks)  
     - Time parsing and formatting  
     - Asynchronous operation queue  
   - For each, explain:  
     1. What the algorithm does.  
     2. A step-by-step example with real variable names.  
     3. Potential vulnerabilities or edge cases.  
   - **Example:**
     \`\`\`ts
     // Click tracking function
     export async function trackClick(itemId: string): Promise<void> {
       try {
         const resp = await api.query(CLICK_MUTATION, { itemId });
         if (!resp.ok) throw new Error('Failed');
       } catch (e) {
         errorLog(e, { module: 'trackClick', itemId });
       }
     }
     \`\`\`

6. **Potential Reverse Engineering / Injection Points**  
   - Identify functions or areas where data interception or logic substitution is possible (middleware, arguments, global objects).  
   - **Example:**  
     > You can replace \`api.query\` with a mock via dependency injection to intercept GraphQL requests.  
     > The \`sendQueue()\` generator can be manipulated by injecting a custom \`queue\` array.

7. **Code Structure Tree and Summary**  
   - Internally analyze the entire codebase to build a hierarchical tree of its modules, functions, and relationships.  
   - Then present a concise, clear rewrite of that tree—listing each node (module, function, export) and its immediate children.

---

**Response Requirements:**  
- Be concise and focused; avoid unnecessary verbosity.  
- Use \`function\` declarations in code examples.  
- Include lines of exact code snippets where necessary..  
- If a section is not applicable, explicitly state "No relevant content."
-  Regardless of the language of this message, you must respond strictly in ${LANGUAGE}. Ignore the language of the question. Never use other languages in your answers. Do not explain why you are writing in ${LANGUAGE}. Do not offer a translation. Do not duplicate answers. Just respond in ${LANGUAGE} right away. This is critically important. So, here is the question:


**Source code for analysis:**

\`\`\`ts
${code}
\`\`\`
    `.trim();
  return prompt;
};
export var OLLAMA_HOST_ADDRESS = "http://localhost:11434";
export var SHOW_DEBUG_LOGS: boolean = false;
/* ----  ↑  ---- */
/* ----  END OF SETTINGS  ---- */
