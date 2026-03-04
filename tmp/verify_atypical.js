const aiFirstLineService = require('d:/helpDesk/backend/services/aiFirstLineService');
const logger = require('d:/helpDesk/backend/utils/logger');


async function testAtypicalQuestions() {
    const testCases = [
        { name: 'Off-topic (Cooking)', query: 'Як зварити борщ?' },
        { name: 'Vague IT', query: 'Мені треба щось зробити з комп\'ютером' },
        { name: 'Direct IT', query: 'Принтер не друкує' }
    ];

    for (const tc of testCases) {
        console.log(`\nTesting: ${tc.name} - "${tc.query}"`);
        try {
            const result = await aiFirstLineService.analyzeIntent([{ role: 'user', content: tc.query }], {});
            console.log('Result:', JSON.stringify({
                isTicketIntent: result.isTicketIntent,
                confidence: result.confidence,
                isUnsure: result.isUnsure,
                offTopicResponse: !!result.offTopicResponse,
                quickSolution: !!result.quickSolution
            }, null, 2));

            if (result.offTopicResponse) {
                console.log('Response excerpt:', result.offTopicResponse.substring(0, 100));
            }
        } catch (err) {
            console.error(`Error in ${tc.name}:`, err);
        }
    }
}

testAtypicalQuestions();
