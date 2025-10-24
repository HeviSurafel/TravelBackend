const express = require("express");
const natural = require("natural");
const knowledge = require("../Data/knowledge");
const router = express.Router();
const classifier = new natural.BayesClassifier();

// Train the classifier
knowledge.forEach(({ question, answer }) => {
  classifier.addDocument(question.toLowerCase(), answer);
});
classifier.train();

// Similarity threshold (0 to 1)
const SIMILARITY_THRESHOLD = 0.7;

router.post("/ask", (req, res) => {
  const { question } = req.body;

  if (!question || question.trim().length === 0) {
    return res.status(400).json({ error: "Question is required" });
  }

  const userInput = question.toLowerCase();

  // Find the most similar question
  let bestMatch = { score: 0, answer: null };

  knowledge.forEach(({ question: knownQuestion, answer }) => {
    const similarity = natural.JaroWinklerDistance(userInput, knownQuestion.toLowerCase());
    if (similarity > bestMatch.score) {
      bestMatch = { score: similarity, answer };
    }
  });

  // Only return answer if similarity is good enough
  if (bestMatch.score >= SIMILARITY_THRESHOLD) {
    return res.json({ answer: bestMatch.answer });
  } else {
    return res.json({
      answer: "Sorry, I couldn't find an answer related to your question.",
    });
  }
});

module.exports = router;