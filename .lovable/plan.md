1. Remover os arquivos exclusivos do mapa de calor
   - src/pages/pdv/delivery/HeatMap.tsx
   - src/components/delivery/heatmap/DeliveryHeatMap.tsx
   - src/components/delivery/heatmap/CEPRankingTable.tsx
   - src/hooks/use-delivery-heatmap.ts
   - src/types/leaflet-heat.d.ts

2. Remover a rota em src/pages/PDV.tsx
   - Apagar o import de DeliveryHeatMap
   - Apagar a Route path="delivery/mapa-calor"

3. Remover o item de navegação em src/components/pdv/PDVHeaderNav.tsx
   - Apagar a linha "Mapa de Calor" da seção Delivery
   - Remover o import do MapPin do lucide-react (se ficar sem uso)

4. Remover as dependências npm que ficarão órfãs
   - leaflet, leaflet.heat, react-leaflet, @types/leaflet
