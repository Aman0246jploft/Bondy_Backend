const { Queue, Worker, QueueEvents } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis({
  maxRetriesPerRequest: null, // Required by BullMQ
});

connection.on("error", (err) => {
  console.error("BullMQ/Redis connection error:", err);
});

/**
 * Helper to create a BullMQ queue
 */
const createQueue = (queueName) => {
  return new Queue(queueName, { connection });
};

/**
 * Helper to register a BullMQ worker
 */
const registerWorker = (queueName, processor, options = {}) => {
  const worker = new Worker(queueName, processor, {
    connection,
    ...options,
  });

  worker.on("completed", (job) => {
    console.log(`[BullMQ] Job ${job.id} in ${queueName} completed.`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[BullMQ] Job ${job?.id} in ${queueName} failed:`, err);
  });

  return worker;
};

/**
 * Helper to register queue events (optional)
 */
const registerQueueEvents = (queueName) => {
  const queueEvents = new QueueEvents(queueName, { connection });
  return queueEvents;
};

/**
 * Helper to add a job to a queue
 */
const addJob = async (queue, data, opts = {}) => {
  try {
    const job = await queue.add(queue.name + "_job", data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      ...opts,
    });
    return job;
  } catch (error) {
    console.error(`[BullMQ] Error adding job to ${queue.name}:`, error);
    throw error;
  }
};

module.exports = {
  createQueue,
  registerWorker,
  registerQueueEvents,
  addJob,
  connection,
};
