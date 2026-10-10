# SearXNG kurulumu (ücretsiz ürün görseli araması)

"Fotoğraftan ürün ekle" ekranı, ürün görsellerini kendi sunucumuzda çalışan açık kaynak
SearXNG arama motoruyla bulur. SearXNG yazılımı ücretsizdir ve API kredisi istemez;
arama motorlarının erişim ve hız sınırları yine geçerlidir.
Sunucuda Docker kurulu olmalıdır (`docker --version`).

1. Klasörleri oluşturun ve ayar dosyasını kopyalayın:

   ```bash
   mkdir -p /opt/searxng/config /opt/searxng/data
   cp /var/www/benimmarketim/ops/searxng/settings.yml /opt/searxng/config/settings.yml
   ```

2. Ayar dosyasına rastgele bir gizli anahtar yazın:

   ```bash
   sed -i "s/BURAYI_DEGISTIR/$(openssl rand -hex 32)/" /opt/searxng/config/settings.yml
   ```

3. SearXNG'yi yalnızca sunucunun içinden erişilecek şekilde başlatın:

   ```bash
   docker run --name searxng -d --restart unless-stopped \
     -p 127.0.0.1:8888:8080 \
     -v /opt/searxng/config/:/etc/searxng/ \
     -v /opt/searxng/data/:/var/cache/searxng/ \
     docker.io/searxng/searxng:latest
   ```

   Docker Hub indirme limitine takılırsanız imaj adını `ghcr.io/searxng/searxng:latest` yapın.

4. Çalıştığını deneyin (JSON dönmeli):

   ```bash
   curl -s "http://127.0.0.1:8888/search?q=ulker+gofret&categories=images&format=json" | head -c 300
   ```

5. Backend `.env` dosyasına ekleyip Node sürecini yeniden başlatın:

   ```
   SEARXNG_URL=http://127.0.0.1:8888
   ```

Gemini fotoğraf tanıma için ücretsiz Google AI Studio katmanını kullanır. `.env` içinde
`GEMINI_API_KEY` ve `GEMINI_VISION_MODEL=gemini-flash-latest` tanımlı olmalıdır. API anahtarını
GitHub'a veya kaynak dosyalarına koymayın.

Uygulama varsayılan olarak ücretli Firecrawl'a geçmez. İsteğe bağlı ücretli aramayı açmak için
`IMAGE_SEARCH_PROVIDER=firecrawl` ve `FIRECRAWL_API_KEY` gerekir.

Güncelleme: `docker pull docker.io/searxng/searxng:latest && docker rm -f searxng` ve 3. adımı tekrarlayın.
