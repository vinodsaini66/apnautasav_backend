import cron from 'node-cron';
import { Wedding } from '../models/wedding.model';

// ⏰ Har din raat 12:01 AM Only for changing status from planning to ongoing
cron.schedule('1 0 * * *', async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    await Wedding.updateMany(
        {
            status: 'planning',
            weddingDate: {
                $gte: todayStart,
                $lte: todayEnd
            }
        },
        {
            $set: { status: 'ongoing' }
        }
    );
});

// ⏰ Har din raat 12:05 AM For changing status from ongoing to completed
cron.schedule('5 0 * * *', async () => {
    try {
        console.log('🕒 Wedding completion cron started');

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const result = await Wedding.updateMany(
            {
                status: 'ongoing',
                weddingDate: { $lt: todayStart }
            },
            {
                $set: { status: 'completed' }
            }
        );

        console.log(`✅ Weddings marked completed: ${result.modifiedCount}`);
    } catch (error) {
        console.error('❌ Wedding completion cron error:', error);
    }
});



