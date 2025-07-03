import { db } from '../utils/database.js';

class Poll {
    constructor(data) {
        this.id = data.id;
        this.question = data.question;
        this.description = data.description;
        this.options = Array.isArray(data.options) ? data.options : JSON.parse(data.options);
        this.votes = typeof data.votes === 'string' ? JSON.parse(data.votes) : data.votes;
        this.channel_id = data.channel_id;
        this.message_id = data.message_id;
        this.guild_id = data.guild_id;
        this.host_id = data.host_id;
        this.created_at = data.created_at;
        this.end_time = data.end_time;
        this.is_ended = data.is_ended || 0;
        this.is_public = data.is_public ? 1 : 0;
        this.max_choices = data.max_choices || 1;
        this.restrict_role = data.restrict_role || null;
        this.cover_image = data.cover_image || null;
    }

    static create(pollData) {
        try {
            const stmt = db.prepare(`
                INSERT INTO polls (
                    id, question, description, options, votes, channel_id, message_id, 
                    guild_id, host_id, created_at, end_time, is_ended, is_public,
                    max_choices, restrict_role, cover_image
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                pollData.id,
                pollData.question,
                pollData.description || null,
                JSON.stringify(pollData.options),
                JSON.stringify(pollData.votes || {}),
                pollData.channel_id,
                pollData.message_id,
                pollData.guild_id,
                pollData.host_id,
                pollData.created_at,
                pollData.end_time || null,
                0,
                pollData.is_public ? 1 : 0,
                pollData.max_choices || 1,
                pollData.restrict_role || null,
                pollData.cover_image || null
            );

            return new Poll(pollData);
        } catch (error) {
            console.error('建立投票時發生資料庫錯誤：', error);
            throw error;
        }
    }

    static findById(id) {
        try {
            const stmt = db.prepare('SELECT * FROM polls WHERE id = ?');
            const poll = stmt.get(id);
            if (!poll) return null;

            return new Poll(poll);
        } catch (error) {
            console.error('查詢票時發生錯誤：', error);
            throw error;
        }
    }

    static findActive(guildId) {
        try {
            const stmt = db.prepare(`
                SELECT * FROM polls 
                WHERE guild_id = ? 
                AND is_ended = 0
                ORDER BY end_time ASC
            `);
            
            const polls = stmt.all(guildId);
            return polls.map(poll => {
                try {
                    return new Poll(poll);
                } catch (error) {
                    return null;
                }
            }).filter(poll => poll !== null);
        } catch (error) {
            console.error('查詢進行中的投票時發生錯誤：', error);
            throw error;
        }
    }

    static find(conditions) {
        try {
            let query = 'SELECT * FROM polls WHERE 1=1';
            const params = [];

            if (conditions.is_ended !== undefined) {
                query += ' AND is_ended = ?';
                params.push(conditions.is_ended ? 1 : 0);
            }

            if (conditions.end_time) {
                if (conditions.end_time.$lte !== undefined) {
                    query += ' AND end_time <= ?';
                    params.push(conditions.end_time.$lte);
                }
            }

            if (conditions.guild_id) {
                query += ' AND guild_id = ?';
                params.push(conditions.guild_id);
            }

            const stmt = db.prepare(query);
            const results = stmt.all(...params);
            
            return results.map(row => new Poll(row));
        } catch (error) {
            console.error('查詢投票時發生錯誤：', error);
            return [];
        }
    }

    save() {
        try {
            const stmt = db.prepare(`
                UPDATE polls 
                SET question = ?, description = ?, options = ?, votes = ?, channel_id = ?, 
                    message_id = ?, guild_id = ?, host_id = ?, end_time = ?, is_ended = ?,
                    is_public = ?, max_choices = ?, restrict_role = ?, cover_image = ?
                WHERE id = ?
            `);

            stmt.run(
                this.question,
                this.description || null,
                JSON.stringify(this.options),
                JSON.stringify(this.votes),
                this.channel_id,
                this.message_id,
                this.guild_id,
                this.host_id,
                this.end_time,
                this.is_ended ? 1 : 0,
                this.is_public ? 1 : 0,
                this.max_choices || 1,
                this.restrict_role || null,
                this.cover_image || null,
                this.id
            );
        } catch (error) {
            console.error('更新投票時發生錯誤：', error);
            throw error;
        }
    }

    delete() {
        try {
            const stmt = db.prepare('DELETE FROM polls WHERE id = ?');
            stmt.run(this.id);
        } catch (error) {
            console.error('刪除投票時發生錯誤：', error);
            throw error;
        }
    }
}

export default Poll;