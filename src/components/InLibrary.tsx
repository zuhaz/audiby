import React, { useState, useEffect } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, EffectCoverflow } from 'swiper/modules';
import { FiSearch, FiPlay, FiTrash2, FiClock } from 'react-icons/fi';
import { open } from '@tauri-apps/plugin-dialog';
import { core } from '@tauri-apps/api';
import { resolveResource } from '@tauri-apps/api/path';

interface LibraryItem {
  id: string;
  title: string;
  author: string;
  series?: string; 
  chapter?: number; 
  description?: string;
  duration: string;
  cover: string;
  progress: number;
  filePath: string;
}

const InLibrary: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);

  useEffect(() => {
    const loadLibrary = async () => {
      try {
        const paths: string[] = await core.invoke('load_library');
        const items = await Promise.all(
          paths.map(async (filePath) => {
            try {
              const metadata: any = await core.invoke('parse_metadata', { path: filePath });
              return {
                id: `${filePath}-${Date.now()}`,
                title: metadata.title || filePath.split(/[\\/]/).pop() || "Unknown Audiobook",
                author: metadata.author || "Unknown Author",
                series: metadata.album, 
                chapter: metadata.track, 
                description: metadata.comment, 
                duration: metadata.duration,
                cover: metadata.cover || await resolveResource('assets/default-cover.jpg'),
                progress: 0,
                filePath
              };
            } catch (error) {
              console.error(`Error loading ${filePath}:`, error);
              return null;
            }
          })
        );
        setLibraryItems(items.filter(Boolean) as LibraryItem[]);
      } catch (error) {
        console.error('Error loading library:', error);
      }
    };
    loadLibrary();
  }, []);
  const handleRemove = (id: string) => {
    setLibraryItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSlideChange = (swiper: any) => {
    setActiveIndex(swiper.activeIndex);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = 'scale(0.95) translateZ(0)';
  };


  const handleAddBooks = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Audio Books',
          extensions: ['mp3', 'm4b', 'aac', 'flac', 'wav']
        }],
        directory: false
      });
  
      if (!selected) return;
  
      const files = Array.isArray(selected) ? selected : [selected];
      
      const newItems = await Promise.all(
        files.map(async (file) => {
          try {
  
            const metadata: any = await core.invoke('parse_metadata', { 
              path: file
            });
  
            let cover = metadata.cover;
            if (!cover) {
              cover = await resolveResource('assets/default-cover.jpg');
            }
  
            return {
              id: `${file.path}-${Date.now()}`,
              title: metadata.title || file.name,
              author: metadata.author || 'Unknown Author',
              series: metadata.album,
              chapter: metadata.track ?? undefined,
              description: metadata.comment,
              duration: metadata.duration,
              cover: cover.startsWith('data:') ? cover : `file://${cover}`,
              progress: 0,
              filePath: file
            };
          } catch (error) {
            console.error(`Error processing ${file?.path || 'unknown file'}:`, error);
            return null;
          }
        })
      );
  
      const validItems = newItems.filter(Boolean) as LibraryItem[];
      
      setLibraryItems(prev => {
        const updated = [...prev, ...validItems];
        (async () => {
          try {
            await core.invoke('save_library', { 
              audiobooks: updated.map(i => i.filePath) 
            });
          } catch (error) {
            console.error('Save error:', error);
          }
        })();
        return updated;
      });
  
    } catch (error) {
      console.error('File selection error:', error);
    }
  };
  const filteredItems = libraryItems.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.author.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const AddSlide = () => (
    <div 
      className="library-slide add-slide"
      onClick={handleAddBooks}
    >
      <div className="add-content">
        <div className="plus-icon">
          <svg viewBox="0 0 24 24" width="48" height="48">
            <path 
              d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" 
              fill="currentColor"
            />
          </svg>
        </div>
        <h3>Add Audiobooks</h3>
        <p>Click to browse your files</p>
      </div>
    </div>
  );

  return (
    <div className="library-container">
      <div className="search-bar">
        <FiSearch className="search-icon" />
        <input
          type="text"
          placeholder="Search your library..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <Swiper
        effect={'coverflow'}
        grabCursor={true}
        centeredSlides={true}
        loop={filteredItems.length + 1 > 3}
        slidesPerView={'auto'}
        spaceBetween={20}
        coverflowEffect={{
          rotate: 0,
          stretch: 0,
          depth: 400,
          modifier: 1,
          slideShadows: false
        }}
        navigation={{
          nextEl: '.swiper-button-next',
          prevEl: '.swiper-button-prev',
        }}
        modules={[EffectCoverflow, Navigation]}
        onSlideChange={handleSlideChange}
        speed={400}
        threshold={15}
        breakpoints={{
          320: { slidesPerView: 1 },
          768: { slidesPerView: 2 },
          1024: { slidesPerView: 3 },
          1440: { slidesPerView: 4 }, 
        }}
        className="library-swiper"
      >
        {filteredItems.map((item, index) => (
          <SwiperSlide key={item.id}>
            <div
              className={`library-slide ${index === activeIndex ? 'active' : ''}`}
              onMouseLeave={handleMouseLeave}
            >
              <div className="slide-image">
                <img
                  src={item.cover}
                  alt={item.title}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'https://source.unsplash.com/random/800x1200?book';
                  }}
                />
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>

              <div className="slide-content">
                <h3>{item.title}</h3>
                <p className="author">{item.author}</p>

                {(item.series || item.chapter) && (
                  <div className="audiobook-meta">
                    {item.series && <span className="series">{item.series}</span>}
                    {item.chapter && <span className="chapter">Chapter {item.chapter}</span>}
                  </div>
                )}

                {item.description && (
                  <p className="description">
                    {item.description.length > 100
                      ? `${item.description.substring(0, 100)}...`
                      : item.description}
                  </p>
                )}

                <div className="meta-info">
                  <FiClock />
                  <span>{item.duration}</span>
                </div>

                <div className="slide-actions">
                  <button className="play-button">
                    <FiPlay size={24} />
                  </button>
                  <button
                    className="remove-button"
                    onClick={() => handleRemove(item.id)}
                  >
                    <FiTrash2 size={24} />
                  </button>
                </div>
              </div>
            </div>
          </SwiperSlide>
        ))}

        <SwiperSlide key="add-slide">
          <AddSlide />
        </SwiperSlide>

        {libraryItems.length > 0 && (
          <div className="swiper-navigation">
            <div className="swiper-button-prev">
              <svg viewBox="0 0 24 24" width="32" height="32">
                <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" />
              </svg>
            </div>
            <div className="swiper-button-next">
              <svg viewBox="0 0 24 24" width="32" height="32">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
              </svg>
            </div>
          </div>
        )}
      </Swiper>

      <style>{`
        .library-container {
          padding: 100px 0 60px;
          background: linear-gradient(45deg, #0a0a0a, #1a1a1a);
          min-height: 100vh;
        }

        .search-bar {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          width: 90%;
          max-width: 600px;
          z-index: 100;
          display: flex;
          align-items: center;
          background: rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 12px 24px;
          backdrop-filter: blur(12px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 12px 40px rgba(0,0,0,0.25);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .search-bar:hover {
          background: rgba(255,255,255,0.12);
        }

        .search-bar input {
          flex: 1;
          background: transparent;
          border: none;
          color: white;
          font-size: 16px;
          font-weight: 500;
          outline: none;
          padding: 8px 0;
        }

        .search-bar input::placeholder {
          color: rgba(255,255,255,0.6);
        }

        .library-swiper {
          width: 100%;
          padding: 40px 0;
          height: calc(100vh - 160px);
        }

        .library-slide {
          position: relative;
          border-radius: 24px;
          overflow: hidden;
          transform: scale(0.92);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 16px 40px rgba(0,0,0,0.3);
          height: 560px;
          background: linear-gradient(45deg, rgba(40,40,40,0.6), rgba(30,30,30,0.8));
          border: 1px solid rgba(255,255,255,0.1);
          will-change: transform;
        }

        .library-slide.active {
          transform: scale(1);
          box-shadow: 0 24px 60px rgba(0,0,0,0.4);
          border: 1px solid rgba(255,255,255,0.2);
        }

        .slide-image {
          position: relative;
          height: 60%;
          overflow: hidden;
        }

        .slide-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: brightness(0.95) saturate(110%);
          transition: transform 0.4s ease;
        }

        .library-slide.active .slide-image img {
          transform: scale(1.03);
        }

        .progress-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00ff88, #00e0ff);
          border-radius: 2px;
          box-shadow: 0 2px 8px rgba(0,255,136,0.3);
        }

        .slide-content {
          padding: 24px;
          color: white;
          height: 40%;
          display: flex;
          flex-direction: column;
          background: linear-gradient(180deg, rgba(30,30,30,0.8), rgba(20,20,20,1));
        }

        .slide-content h3 {
          margin: 0 0 8px;
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          background: linear-gradient(45deg, #fff, #e0e0e0);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .author {
          color: rgba(255,255,255,0.9);
          margin: 0 0 12px;
          font-size: 1rem;
          font-weight: 500;
          opacity: 0.9;
        }

        .meta-info {
          display: flex;
          align-items: center;
          gap: 8px;
          color: rgba(255,255,255,0.8);
          margin-top: auto;
          font-size: 0.9rem;
        }

        .slide-actions {
          display: flex;
          gap: 12px;
          margin-top: 20px;
        }

        .play-button, .remove-button {
          flex: 1;
          padding: 14px;
          border: none;
          border-radius: 12px;
          background: rgba(255,255,255,0.08);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: blur(8px);
        }

        .play-button:hover {
          background: linear-gradient(45deg, rgba(0,255,136,0.3), rgba(0,224,255,0.3));
          transform: translateY(-2px);
        }

        .remove-button:hover {
          background: linear-gradient(45deg, rgba(255,50,50,0.3), rgba(255,100,100,0.3));
          transform: translateY(-2px);
        }

        .swiper-navigation > div {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 56px;
          height: 56px;
          background: rgba(40, 40, 40, 0.9);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          backdrop-filter: blur(12px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 10;
          color: rgba(255,255,255,0.9);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .swiper-navigation > div:hover {
          background: rgba(255,255,255,0.2);
          transform: translateY(-50%) scale(1.08);
          color: white;
        }

        .add-slide {
          background: linear-gradient(45deg, rgba(50,50,50,0.6), rgba(40,40,40,0.8));
          border: 2px dashed rgba(255,255,255,0.15);
          transition: all 0.3s ease;
        }

        .add-slide:hover {
          background: linear-gradient(45deg, rgba(70,70,70,0.6), rgba(60,60,60,0.8));
          border-color: rgba(255,255,255,0.3);
        }

        .add-content h3 {
          background: linear-gradient(45deg, #fff, #00ff88);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .audiobook-meta {
          display: flex;
          gap: 8px;
          margin: 8px 0;
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.8);
        }

        .series {
          background: rgba(0, 255, 136, 0.1);
          color: #00ff88;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .chapter {
          background: rgba(255, 255, 255, 0.1);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .description {
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.7);
          margin: 8px 0;
          line-height: 1.4;
        }

        @media (max-width: 768px) {
          .library-container {
            padding: 80px 0 40px;
          }

          .library-slide {
            height: 450px;
          }

          .swiper-navigation > div {
            width: 40px;
            height: 40px;
          }
        }
      `}</style>
    </div>
  );
};

export default InLibrary;