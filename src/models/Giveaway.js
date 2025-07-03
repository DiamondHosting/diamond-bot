import { db } from '../utils/database.js';

class Giveaway {
    constructor(data) {
        this.id = data.id;
        this.prize = data.prize;
        this.description = data.description;
        this.winners_count = data.winners_count;
        this.channel_id = data.channel_id;
        this.message_id = data.message_id;
        this.guild_id = data.guild_id;
        this.host_id = data.host_id;
        this.role_requirement = data.role_requirement;
        this.participants = typeof data.participants === 'string' ? 
            JSON.parse(data.participants) : data.participants;
        this.created_at = data.created_at;
        this.end_time = data.end_time;
        this.is_ended = data.is_ended || 0;
    }

    static create(giveawayData) {
        try {
            const stmt = db.prepare(`
                INSERT INTO giveaways (
                    id, prize, description, winners_count, channel_id, message_id, 
                    guild_id, host_id, role_requirement, participants, created_at, 
                    end_time, is_ended
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                giveawayData.id,
                giveawayData.prize,
                giveawayData.description || null,
                giveawayData.winners_count,
                giveawayData.channel_id,
                giveawayData.message_id,
                giveawayData.guild_id,
                giveawayData.host_id,
                giveawayData.role_requirement || null,
                JSON.stringify(giveawayData.participants || []),
                giveawayData.created_at,
                giveawayData.end_time,
                0
            );

            return new Giveaway(giveawayData);
        } catch (error) {
            console.error('建立抽獎時發生資料庫錯誤：', error);
            throw error;
        }
    }

    static findById(id) {
        try {
            const stmt = db.prepare('SELECT * FROM giveaways WHERE id = ?');
            const giveaway = stmt.get(id);
            if (!giveaway) return null;

            return new Giveaway(giveaway);
        } catch (error) {
            console.error('查詢抽獎時發生錯誤：', error);
            throw error;
        }
    }

    static findActive(guildId) {
        try {
            const stmt = db.prepare(`
                SELECT * FROM giveaways 
                WHERE guild_id = ? 
                AND is_ended = 0
                ORDER BY end_time ASC  /* 按結束時間排序 */
            `);
            
            const giveaways = stmt.all(guildId);
            return giveaways.map(giveaway => {
                try {
                    return new Giveaway(giveaway);
                } catch (error) {
                    return null;
                }
            }).filter(giveaway => giveaway !== null);
        } catch (error) {
            console.error('查詢進行中的抽獎時發生錯誤：', error);
            throw error;
        }
    }

    save() {
        try {
            const stmt = db.prepare(`
                UPDATE giveaways 
                SET prize = ?, description = ?, winners_count = ?, channel_id = ?, 
                    message_id = ?, guild_id = ?, host_id = ?, role_requirement = ?, 
                    participants = ?, end_time = ?, is_ended = ?
                WHERE id = ?
            `);

            stmt.run(
                this.prize,
                this.description || null,
                this.winners_count,
                this.channel_id,
                this.message_id,
                this.guild_id,
                this.host_id,
                this.role_requirement || null,
                JSON.stringify(this.participants),
                this.end_time,
                this.is_ended ? 1 : 0,
                this.id
            );
        } catch (error) {
            console.error('更新抽獎時發生錯誤：', error);
            throw error;
        }
    }

    delete() {
        try {
            const stmt = db.prepare('DELETE FROM giveaways WHERE id = ?');
            stmt.run(this.id);
        } catch (error) {
            console.error('刪除抽獎時發生錯誤：', error);
            throw error;
        }
    }
}

export default Giveaway; 