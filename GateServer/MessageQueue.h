#include <atomic>
#include <utility>
#include <cassert>

template <typename T>
class MPSCQueue {
private:
    struct Node {
        T data;
        std::atomic<Node*> next; // 节点后继指针，原子保证多线程可见性
        Node(T val) : data(std::move(val)), next(nullptr) {}
        Node() : next(nullptr) {} // 哨兵节点专用构造函数
    };

    std::atomic<Node*> head_; // 队列头（仅消费者修改）
    std::atomic<Node*> tail_; // 队列尾（多生产者竞争修改）

public:
    // 构造函数：初始化哨兵节点，规避队列为空的边界问题
    MPSCQueue() {
        Node* dummy = new Node();
        head_.store(dummy, std::memory_order_relaxed);
        tail_.store(dummy, std::memory_order_relaxed);
    }

    // 禁止拷贝/移动（原子变量不可拷贝）
    MPSCQueue(const MPSCQueue&) = delete;
    MPSCQueue& operator=(const MPSCQueue&) = delete;

    // 析构函数：释放所有节点，避免内存泄漏
    ~MPSCQueue() {
        T val;
        while (dequeue(val)) {} // 清空所有有效节点
        delete head_.load(std::memory_order_relaxed); // 释放最终哨兵节点
    }

    // 【多线程安全】多生产者无锁入队
    void enqueue(T val) {
        Node* new_node = new Node(std::move(val));
        Node* old_tail = nullptr;
        Node* old_tail_next = nullptr;

        while (true) {
            // 1. 加载最新的尾节点，acquire保证后续操作可见最新值
            old_tail = tail_.load(std::memory_order_acquire);
            old_tail_next = old_tail->next.load(std::memory_order_acquire);

            // 2. 校验尾节点是否被其他线程修改，若修改则重试
            if (old_tail != tail_.load(std::memory_order_acquire)) {
                continue;
            }

            // 3. 协助推进机制：其他生产者已完成入队但未更新尾节点，主动帮忙推进
            if (old_tail_next != nullptr) {
                tail_.compare_exchange_weak(old_tail, old_tail_next,
                    std::memory_order_release, std::memory_order_relaxed);
                continue;
            }

            // 4. 尝试原子修改尾节点的后继指针，完成入队核心逻辑
            Node* expected = nullptr;
            if (old_tail->next.compare_exchange_weak(expected, new_node,
                std::memory_order_release, std::memory_order_relaxed)) {
                // 5. 尝试更新尾节点，失败也无需重试（其他线程会协助推进）
                tail_.compare_exchange_weak(old_tail, new_node,
                    std::memory_order_release, std::memory_order_relaxed);
                return;
            }
        }
    }
    bool dequeue(T& val) {
        // 仅消费者修改head，无需CAS，直接加载即可
        Node* old_head = head_.load(std::memory_order_acquire);
        Node* next_node = old_head->next.load(std::memory_order_acquire);

        // 队列为空，直接返回
        if (next_node == nullptr) {
            return false;
        }

        // 取出有效数据，更新哨兵节点
        val = std::move(next_node->data);
        head_.store(next_node, std::memory_order_release);
        // 释放旧的哨兵节点
        delete old_head;

        return true;
    }
    bool empty() const {
        return head_.load(std::memory_order_acquire)->next.load(std::memory_order_acquire) == nullptr;
    }
};