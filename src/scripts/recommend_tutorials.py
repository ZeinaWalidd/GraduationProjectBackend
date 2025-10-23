import mysql.connector
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import sys
import json
import datetime

# CONFIGURATION
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',     
    'password': '',  
    'database': 'Incognito'     
}
USER_ID = 1  # <-- CHANGE THIS to the user you want recommendations for
TOP_N = 5

def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)

def fetch_all_tutorials(cursor):
    cursor.execute("SELECT id, title, category, tags, description, image_url, content, created_at FROM tutorials")
    return cursor.fetchall()

def fetch_user_tutorials(cursor, user_id):
    cursor.execute("""
        SELECT t.id, t.title, t.category, t.tags
        FROM tutorial_views v
        JOIN tutorials t ON v.tutorial_id = t.id
        WHERE v.user_id = %s
    """, (user_id,))
    return cursor.fetchall()

def recommend_tutorials(user_id, top_n=5, as_json=False):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    all_tutorials = fetch_all_tutorials(cursor)
    user_tutorials = fetch_user_tutorials(cursor, user_id)
    if not user_tutorials:
        recs = all_tutorials[:top_n]
    else:
        all_tags = [t['tags'] or '' for t in all_tutorials]
        user_tags = ' '.join([t['tags'] or '' for t in user_tutorials])
        vectorizer = TfidfVectorizer()
        tfidf_matrix = vectorizer.fit_transform([user_tags] + all_tags)
        cosine_sim = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:]).flatten()
        top_indices = cosine_sim.argsort()[-top_n:][::-1]
        recs = [all_tutorials[i] for i in top_indices]
    if as_json:
        print(json.dumps(recs, cls=DateTimeEncoder))
    else:
        print(f"Top {top_n} recommended tutorials for user {user_id}:")
        for rec in recs:
            print(f"- {rec['title']} (Category: {rec['category']}, Tags: {rec['tags']})")
    cursor.close()
    conn.close()

class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime.datetime, datetime.date)):
            return obj.isoformat()
        return super().default(obj)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python recommend_tutorials.py <user_id> [top_n]")
        sys.exit(1)
    user_id = int(sys.argv[1])
    top_n = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    recommend_tutorials(user_id, top_n, as_json=True) 