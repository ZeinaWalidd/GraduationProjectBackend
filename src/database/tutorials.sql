CREATE TABLE IF NOT EXISTS article_bookmarks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    article_url VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    description TEXT,
    source VARCHAR(255),
    published_at DATETIME,
    UNIQUE KEY unique_user_article (user_id, article_url),
    FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tutorials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    category VARCHAR(100),
    tags VARCHAR(255),
    image_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tutorial_views (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    tutorial_id INT NOT NULL,
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tutorial_id) REFERENCES tutorials(id) ON DELETE CASCADE
);

INSERT INTO tutorials (title, content, category, tags, image_url) VALUES
('10 Essential Self-Defense Tips for Everyone', 'Learn the basics of self-defense...', 'Self Defense', 'self defense, basics, safety', NULL),
('How to Stay Safe When Walking Alone at Night', 'Practical tips for staying safe...', 'Personal Safety', 'night, walking, safety', NULL),
('Women\'s Safety: What You Need to Know', 'Important safety tips for women...', 'Women Safety', 'women, safety, tips', NULL),
('How to Use Pepper Spray Effectively', 'A guide to using pepper spray...', 'Self Defense', 'pepper spray, defense, safety', NULL),
('Travel Safety: Protect Yourself Abroad', 'Tips for staying safe while traveling...', 'Travel', 'travel, safety, tips', NULL),
('Basic First Aid Everyone Should Know', 'First aid can save lives...', 'First Aid', 'first aid, emergency, safety', NULL),
('How to Escape Common Grabs and Holds', 'Simple techniques to break free...', 'Self Defense', 'escape, holds, self defense', NULL),
('Staying Safe on Public Transport', 'Public transport safety tips...', 'Personal Safety', 'public transport, safety, tips', NULL),
('How to Recognize and Avoid Scams', 'Protect yourself from scams...', 'Awareness', 'scams, awareness, safety', NULL),
('Emergency Contacts: Who to Call and When', 'Know who to call in emergencies...', 'Emergency', 'emergency, contacts, safety', NULL),
('How to Use Your Voice for Self-Defense', 'Your voice is a powerful tool...', 'Self Defense', 'voice, self defense, safety', NULL),
('Safety Apps You Should Have on Your Phone', 'Best apps for personal safety...', 'Tech', 'apps, safety, phone', NULL),
('How to Stay Safe at Home Alone', 'Home safety tips...', 'Home Safety', 'home, safety, alone', NULL),
('De-escalation Techniques Everyone Should Know', 'How to avoid physical confrontation...', 'Self Defense', 'de-escalation, self defense, safety', NULL),
('How to Help Others in an Emergency', 'Be a good bystander...', 'Emergency', 'bystander, emergency, help', NULL);