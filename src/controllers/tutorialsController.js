const db = require('../config');
const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const TutorialsController = {
    // Get all tutorials
    getAllTutorials: async (req, res) => {
        try {
            const [tutorials] = await db.query('SELECT * FROM tutorials');
            res.json(tutorials);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // Get recommended tutorials based on user preferences and history
    getRecommendedTutorials: async (req, res) => {
        try {
            const userId = req.user.id;

            // Get user's viewing history and preferences
            const [userHistory] = await db.query(
                `SELECT t.category, t.tags, COUNT(*) as view_count 
                FROM tutorial_views tv
                JOIN tutorials t ON tv.tutorial_id = t.id
                WHERE tv.user_id = ?
                GROUP BY t.category, t.tags`,
                [userId]
            );

            // Get user's saved tutorials
            const [savedTutorials] = await db.query(
                `SELECT t.category, t.tags
                FROM saved_tutorials st
                JOIN tutorials t ON st.tutorial_id = t.id
                WHERE st.user_id = ?`,
                [userId]
            );

            // Get all tutorials
            const [allTutorials] = await db.query('SELECT * FROM tutorials');

            // Prepare user preferences for AI
            const userPreferences = {
                viewedCategories: userHistory.map(h => h.category),
                viewedTags: userHistory.flatMap(h => h.tags.split(',')),
                savedCategories: savedTutorials.map(t => t.category),
                savedTags: savedTutorials.flatMap(t => t.tags.split(','))
            };

            // Get AI recommendations
            const recommendations = await getAIRecommendations(allTutorials, userPreferences);

            res.json({
                success: true,
                recommendations,
                userPreferences
            });
        } catch (error) {
            console.error('Error in getRecommendedTutorials:', error);
            res.status(500).json({ 
                success: false,
                message: error.message 
            });
        }
    },

    // Record tutorial view
    recordTutorialView: async (req, res) => {
        try {
            const { tutorialId } = req.params;
            const userId = req.user.id;

            await db.query(
                'INSERT INTO tutorial_views (user_id, tutorial_id, viewed_at) VALUES (?, ?, NOW())',
                [userId, tutorialId]
            );

            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // Save tutorial
    saveTutorial: async (req, res) => {
        try {
            const { tutorialId } = req.params;
            const userId = req.user.id;

            await db.query(
                'INSERT INTO saved_tutorials (user_id, tutorial_id) VALUES (?, ?)',
                [userId, tutorialId]
            );

            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // Get personalized tips
    getPersonalizedTips: async (req, res) => {
        try {
            const userId = req.user.id;

            // Get user's profile and preferences
            const [userProfile] = await db.query(
                'SELECT * FROM users WHERE id = ?',
                [userId]
            );

            // Get user's tutorial history
            const [tutorialHistory] = await db.query(
                `SELECT t.category, t.tags
                FROM tutorial_views tv
                JOIN tutorials t ON tv.tutorial_id = t.id
                WHERE tv.user_id = ?
                ORDER BY tv.viewed_at DESC
                LIMIT 10`,
                [userId]
            );

            // Generate personalized tips using AI
            const tips = await generatePersonalizedTips(userProfile[0], tutorialHistory);

            res.json({
                success: true,
                tips
            });
        } catch (error) {
            console.error('Error in getPersonalizedTips:', error);
            res.status(500).json({ 
                success: false,
                message: error.message 
            });
        }
    }
};

// Helper function to get AI recommendations
async function getAIRecommendations(tutorials, userPreferences) {
    try {
        const prompt = `Based on the following user preferences and available tutorials, recommend the most relevant tutorials:
        
        User Preferences:
        - Viewed Categories: ${userPreferences.viewedCategories.join(', ')}
        - Viewed Tags: ${userPreferences.viewedTags.join(', ')}
        - Saved Categories: ${userPreferences.savedCategories.join(', ')}
        - Saved Tags: ${userPreferences.savedTags.join(', ')}

        Available Tutorials:
        ${tutorials.map(t => `- ${t.title} (Category: ${t.category}, Tags: ${t.tags})`).join('\n')}

        Please recommend the top 5 most relevant tutorials based on the user's preferences and interests.`;

        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: prompt,
            max_tokens: 500,
            temperature: 0.7,
        });

        // Parse AI response and match with actual tutorials
        const recommendations = parseAIRecommendations(response.data.choices[0].text, tutorials);
        return recommendations;
    } catch (error) {
        console.error('Error getting AI recommendations:', error);
        throw new Error('Failed to generate recommendations');
    }
}

// Helper function to generate personalized tips
async function generatePersonalizedTips(userProfile, tutorialHistory) {
    try {
        const prompt = `Generate personalized self-defense tips based on the following user profile and tutorial history:
        
        User Profile:
        - Gender: ${userProfile.gender}
        - Age: ${userProfile.age}
        - Location: ${userProfile.location}

        Recent Tutorial History:
        ${tutorialHistory.map(t => `- ${t.category}: ${t.tags}`).join('\n')}

        Please provide 3 personalized self-defense tips that would be most relevant to this user.`;

        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: prompt,
            max_tokens: 300,
            temperature: 0.7,
        });

        return parseAITips(response.data.choices[0].text);
    } catch (error) {
        console.error('Error generating personalized tips:', error);
        throw new Error('Failed to generate personalized tips');
    }
}

// Helper function to parse AI recommendations
function parseAIRecommendations(aiResponse, tutorials) {
    // Extract tutorial titles from AI response
    const recommendedTitles = aiResponse
        .split('\n')
        .filter(line => line.startsWith('-'))
        .map(line => line.replace('-', '').trim());

    // Match with actual tutorials
    return tutorials
        .filter(tutorial => recommendedTitles.includes(tutorial.title))
        .slice(0, 5);
}

// Helper function to parse AI tips
function parseAITips(aiResponse) {
    return aiResponse
        .split('\n')
        .filter(line => line.startsWith('-'))
        .map(line => line.replace('-', '').trim());
}

module.exports = TutorialsController; 