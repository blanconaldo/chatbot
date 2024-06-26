const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const responsesPath = path.join(__dirname, 'botResponses.json');
let responses = [];

// Read bot responses from JSON file
try {
    const data = fs.readFileSync(responsesPath, 'utf-8');
    responses = JSON.parse(data);
} catch (err) {
    console.error('Error reading botResponses.json:', err);
    process.exit(1);
}

const maxFailures = 3;
const sessionContext = {};

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve chat history
app.get('/chat-history', (req, res) => {
    // Example: Sending mock chat history for demonstration
    const history = [
        { speaker: 'bot', message: 'Hi there! How can I help you?' }
    ];
    res.json(history);
});

// Socket.IO connection handler
io.on('connection', (socket) => {
    const userId = socket.id;
    console.log(`User connected: ${userId}`);

    // Initialize session context if not already initialized
    if (!sessionContext[userId]) {
        sessionContext[userId] = {
            history: [], // Array to store conversation history
            consecutiveFailures: 0 // Track consecutive failures
        };
    }

    // Event listener for incoming messages from the client
    socket.on('chat message', (msg) => {
        console.log(`Received message from ${userId}: ${msg}`);

        const lowerMsg = msg.toLowerCase();

        // Logic to find response based on user message
        let response = responses.find(res => {
            if (res.user_input.some(input => lowerMsg.includes(input))) {
                return res.required_words.every(word => lowerMsg.includes(word));
            }
            return false;
        });

        // Store user message in session history
        sessionContext[userId].history.push({ speaker: 'user', message: msg });

        if (response) {
            // Reset consecutive failures on successful response
            sessionContext[userId].consecutiveFailures = 0;
            console.log(`Sending response to ${userId}: ${response.bot_response}`);
            io.to(userId).emit('chat message', response.bot_response);
        } else {
            // Increment consecutive failures and check for hard fallback
            sessionContext[userId].consecutiveFailures++;
            if (sessionContext[userId].consecutiveFailures >= maxFailures) {
                console.log(`Hard fallback triggered for ${userId}.`);
                io.to(userId).emit('hard fallback');
            } else {
                const defaultResponse = "I don't understand.";
                console.log(`Sending default response to ${userId}: ${defaultResponse}`);
                io.to(userId).emit('chat message', defaultResponse);
            }
        }
    });

    // Event listener for user disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${userId}`);
        delete sessionContext[userId]; // Clean up session context
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
