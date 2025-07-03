import { db } from '../utils/database.js';

export default {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        const tempChannel = db.prepare('SELECT * FROM temp_voice_channels WHERE channel_id = ?')
            .get(oldState.channelId);

        if (tempChannel && oldState.channel) {
            if (oldState.channel.members.size === 0) {
                try {
                    await oldState.channel.delete();
                    db.prepare('DELETE FROM temp_voice_channels WHERE channel_id = ?')
                        .run(oldState.channelId);
                } catch (error) {
                    console.error('刪除臨時頻道時發生錯誤:', error);
                }
            }
        }
    }
}; 