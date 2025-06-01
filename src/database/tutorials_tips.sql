CREATE TABLE IF NOT EXISTS tutorials_tips (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    source_url VARCHAR(255),
    image_url VARCHAR(255),
    author VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    tags JSON,
    difficulty_level ENUM('beginner', 'intermediate', 'advanced') DEFAULT 'beginner',
    is_featured BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS user_preferences (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    preferred_categories JSON,
    difficulty_preference ENUM('beginner', 'intermediate', 'advanced') DEFAULT 'beginner',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
);

-- Insert some sample data
INSERT INTO tutorials_tips (title, content, category, source_url, author, tags, difficulty_level) VALUES
('Basic Self-Defense Techniques', 'Learn essential self-defense moves that can help you in emergency situations...', 'self-defense', 'https://example.com/self-defense', 'Safety Expert', '["self-defense", "basics", "safety"]', 'beginner'),
('Situational Awareness Tips', 'How to stay aware of your surroundings and avoid dangerous situations...', 'safety-tips', 'https://example.com/awareness', 'Security Specialist', '["awareness", "safety", "prevention"]', 'beginner'),
('Emergency Response Guide', 'What to do in various emergency situations...', 'emergency', 'https://example.com/emergency', 'Emergency Response Team', '["emergency", "response", "safety"]', 'intermediate'); 