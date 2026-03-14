const getUrl = (pathname: string): string => {
  const baseUrl = import.meta.env.BASE_URL;

  if (baseUrl && baseUrl !== '/') {
    return baseUrl.replace(/\/$/, '') + pathname;
  } else {
    return pathname;
  }
};

export { getUrl };

// Usage Example:

// 1. In an <img> tag:
// <img src={getUrl('/images/logo.png')} />

// 2. As a background image:
// <div style={{backgroundImage: `url(${getUrl('images/background.jpg')})`}}>
