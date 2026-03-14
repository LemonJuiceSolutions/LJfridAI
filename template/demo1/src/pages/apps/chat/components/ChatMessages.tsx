import { useEffect, useRef } from 'react';
import SimpleBar from 'simplebar-react';

interface MessageContent {
  text: string;
  timestamp?: string;
}

interface ChatMessage {
  id: number;
  sender: 'me' | 'friend';
  avatar: string;
  contents: MessageContent[];
  imageUrl?: string;
}

interface ChatMessagesProps {
  messages: ChatMessage[];
}

const ChatMessages = ({ messages }: ChatMessagesProps) => {
  const scrollableNodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollableNodeRef.current) {
      scrollableNodeRef.current.scrollTop = scrollableNodeRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="chat-body">
      <SimpleBar className="h-100" scrollableNodeProps={{ ref: scrollableNodeRef }}>
        <ul className="messages">
          {messages.map((msg) => (
            <li key={msg.id} className={`message-item ${msg.sender}`}>
              <img src={msg.avatar} className="avatar img-xs rounded-circle" alt="avatar" />
              <div className="content">
                {msg.contents.map((content, idx) => (
                  <div className="message" key={idx}>
                    <div className="bubble">
                      {msg.imageUrl && idx === 1 ? (
                        <img src={msg.imageUrl} alt="chat-img" className="img-fluid" />
                      ) : (
                        <p>{content.text}</p>
                      )}
                    </div>
                    {content.timestamp && <span>{content.timestamp}</span>}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </SimpleBar>
    </div>
  );
};

export default ChatMessages;
