
const schedule = require('node-schedule');
const { incrementReminderUsage, getReminderUsage } = require('./db');
const {User,Reminder} = require('./models');


const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function handleReminderCommand(bot, msg, match) {
 try {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;
  // console.log(msg.chat.username || msg.chat.first_name)
  const chatName = getChatName(msg.chat);
  const message = match[1];
  const day = match[2];
  const month = match[3];
  const year = match[4];
  const time = match[5];

  
  console.log(`Received reminder command: message=${message}, day=${day}, month=${month}, year=${year}, time=${time}`);
  
  const remindersSet = await getReminderUsage(userId);
 
  if (remindersSet >= 20) {
    bot.sendMessage(chatId, 'You have reached your limit of 20 reminders.');
    bot.deleteMessage(chatId, messageId.toString()).catch((err) => {
      console.error('Failed to delete command message:', err.message);
    });
    return;
  }

  const hours = parseInt(time.substring(0, 2));
  const minutes = parseInt(time.substring(2, 4));
  const date = new Date(Date.UTC(year, monthNames.indexOf(month), day, hours, minutes));
  const currentDate = new Date();

  // Check if the reminder date is in the past or current time
  if (date <= currentDate) {
    bot.sendMessage(chatId, '⚠️ Please select a future date and time for the reminder.');
    bot.deleteMessage(chatId, messageId.toString()).catch((err) => {
      console.error('Failed to delete invalid command message:', err.message);
    });
    return;
  }

  console.log(`Scheduled reminder at: ${date.toISOString()}`);

  const jobName = `${userId}-${date.getTime()}`;
  const job = schedule.scheduleJob(jobName, date, async () => {
    console.log(`Triggering reminder for user ${userId} at ${new Date().toISOString()}`);
    try {
      await bot.sendMessage(userId, `🔔Reminder: ${message}`);
      if (chatId !== userId) {
        await bot.sendMessage(chatId, `🔔Reminder: ${message}`);
      }
    } catch (error) {
      console.error('Error sending reminder:', error);
    }
    await Reminder.deleteOne({ jobName });
  });

  const reminder = new Reminder({
    userId,
    chatId,
    chatName,
    message,
    date,
    jobName
  });

  await reminder.save();
  await incrementReminderUsage(userId);

  console.log('Reminder added to database:', { userId, chatId, chatName, message, date, jobName });

  bot.sendMessage(chatId, `Reminder set for: ${message} on ${day} ${month} ${year} at ${time} UTC`)
    .then((confirmationMsg) => {
      bot.deleteMessage(chatId, messageId.toString()).catch((err) => {
        console.error('Failed to delete command message:', err.message);
      });
      setTimeout(() => {
        bot.deleteMessage(chatId, confirmationMsg.message_id.toString()).catch((err) => {
          console.error('Failed to delete confirmation message:', err.message);
        });
      }, 3000);
    });
 } catch (error) {
  console.log(error)
 }
}

async function handleUpcomingCommand(bot, msg) {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
  
    if (msg.chat.type === 'private') {
      const personalReminders = await Reminder.find({ userId, chatId: userId, date: { $gt: new Date() } });
      const groupReminders = await Reminder.find({ userId, chatId: { $ne: userId }, date: { $gt: new Date() } });
  
      let personalTasks = '';
      let groupTasks = '';
  
      personalReminders.forEach((task, index) => { 
        personalTasks += `${index + 1}. ${task.message} on ${task.date.toUTCString()}\n`;
      });
  
      groupReminders.forEach((task, index) => {
        groupTasks += `${index + 1}. ${task.message} on ${task.date.toUTCString()} (Group: ${task.chatName})\n`;
      });
  
      let response = '<b>📝My upcoming tasks:</b>\n\n';
  
      response += '<b>A. Personal notification(s)🔔</b>\n';
      if (personalTasks) {
        response += personalTasks + '\n';
      } else {
        response += 'No upcoming personal tasks.\n\n';
      }
  
      response += '<b>B. Group notification(s)🔔</b>\n';
      if (groupTasks) {
        response += groupTasks;
      } else {
        response += 'No upcoming group tasks.';
      }
  
      bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
    } else {
      const groupReminders = await Reminder.find({ chatId, date: { $gt: new Date() } });
  
      let groupTasks = '';
  
      groupReminders.forEach((task, index) => {
       
        groupTasks += `${index + 1}. ${task.message} on ${task.date.toUTCString()}\n`;
      });
  
      let response = '<b>📝Group upcoming tasks:</b>\n\n';
  
      if (groupTasks) {
        response += groupTasks;
      } else {
        response += 'No upcoming group tasks.';
      }
  
      bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
    }
  } catch (error) {
    console.log(error)
  }
}

function getChatName(chat) {
  return chat.title || chat.username || chat.first_name || 'Unknown Chat';
}

module.exports = {
  handleReminderCommand,
  handleUpcomingCommand,
};
