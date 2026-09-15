# Nông trại 2.5D

Web game nông trại thế giới mở với đồ hoạ **cozy vẽ tay** — nét mực nâu quanh
mọi vật thể, màu pastel, vân giấy phủ toàn khung hình — trên nền camera sau lưng
xoay tự do, kèm hệ thống bắt và giao việc cho pet kiểu Palworld.

**Trạng thái: POC chơi đơn, đã chạy được trọn vòng lặp.** Multiplayer chưa làm —
xem [Lộ trình multiplayer](#lộ-trình-multiplayer).

## Chạy thử

```bash
npm install
npm run dev      # http://localhost:3000
```

Không cần cấu hình gì thêm. Không có Firebase thì game tự lưu vào `localStorage`.

## Điều khiển

| Phím | Tác dụng |
|---|---|
| `WASD` / mũi tên | Di chuyển **theo hướng camera** |
| Giữ chuột phải + rê | Xoay camera quanh nhân vật |
| `Q` / `E` | Xoay camera bằng bàn phím |
| Cuộn chuột | Kéo camera xa / gần |
| `Shift` | Chạy (tốn sức) |
| `1`–`6` | Chọn dụng cụ |
| Chuột trái / `Space` | Dùng dụng cụ lên ô đang nhắm |
| `[` / `]` | Đổi loại hạt giống |
| `R` | Ăn nông sản để hồi sức |
| `Tab` | Bảng pet |

Camera hạ thấp để ngắm cảnh, nâng cao (tới 72°) khi cần canh ô để cuốc đất.

Vòng lặp chơi: **cuốc đất → gieo hạt → tưới → thu hoạch → bán → mua hạt tốt hơn.**
Cây khô vẫn lớn nhưng chậm 3 lần, nên tưới là việc đáng làm chứ không bắt buộc.

Bắt pet: chọn bóng (`6`), ném vào pet hoang. Pet hoang chỉ bỏ chạy khi bạn cầm
bóng. Ném trượt thì pet mệt đi, lần sau dễ bắt hơn. Bắt được rồi thì vào bảng
pet (`Tab`) giao việc — pet sẽ tự đi tưới / thu hoạch / nhặt gỗ mà không cần bạn.

## Stack

- **Nuxt 4** ở chế độ SPA (`ssr: false`) — game cần WebGL, SSR không đem lại gì.
- **Tailwind 4** qua plugin Vite, chỉ dùng cho HUD.
- **three.js** — camera phối cảnh quỹ đạo sau lưng, địa hình có độ cao, vòm trời
  gradient, và phong cách vẽ tay dựng từ ba thành phần: viền mực vỏ-lộn-ngược,
  ramp toon 2 bậc (mảng sáng phẳng + mảng bóng), và vân giấy ở tầng CSS.
- **Firebase** (tuỳ chọn) — Auth ẩn danh + Firestore để lưu cloud.

## Kiến trúc

Nguyên tắc chính: **engine không biết gì về Vue, Vue không biết gì về three.js.**

```
app/game/                 ← TypeScript thuần, không import 'vue'
├── core/
│   ├── Engine.ts         Điểm nối duy nhất giữa UI và gameplay
│   ├── EventBus.ts       Engine emit → Vue lắng nghe (xem ghi chú bên dưới)
│   ├── Input.ts          Gom input thô, không biết luật chơi
│   ├── Time.ts           Đồng hồ thế giới, chu kỳ ngày/đêm
│   └── rng.ts            PRNG có seed + value noise
├── world/
│   ├── Grid.ts           Lưới tile — nguồn sự thật duy nhất về địa hình
│   └── Heightmap.ts      Độ cao lưu theo GÓC ô nên đồi không nứt thành mảng
├── render/               Tầng three.js, chỉ đọc Grid rồi vẽ
│   ├── SceneManager.ts   Ánh sáng, sương mù, các InstancedMesh
│   ├── CameraRig.ts      Camera quỹ đạo — nguồn sự thật cho HƯỚNG di chuyển
│   ├── TerrainMesh.ts    Địa hình + mặt nước, nướng thành mesh vertex-color
│   ├── Outline.ts        Viền mực — vỏ lộn ngược, dùng chung cho mesh & instanced
│   ├── Sky.ts            Vòm trời gradient đổi màu theo giờ
│   ├── GrassField.ts     Thảm cỏ instanced, gió tính trong vertex shader
│   └── models/           Model dựng bằng code, không có file asset nào
├── entities/Player.ts
├── systems/              Luật chơi
│   ├── FarmActions.ts    "Dùng dụng cụ X lên ô Y" — pet dùng chung luật này
│   ├── CropSystem.ts     Sinh trưởng theo thời gian
│   ├── PetSystem.ts      Máy trạng thái AI + giao việc
│   └── CatchSystem.ts    Ném bóng bắt pet
├── data/                 Bảng số liệu cây trồng & pet
└── save/                 Firestore + localStorage
```

### Vì sao UI không bind thẳng vào state engine

`useGameStore` **chép** dữ liệu từ engine sang ref của Vue mỗi khi có event, thay
vì bọc `reactive()` quanh state engine. Engine ghi toạ độ nhân vật 60 lần/giây;
nếu để Vue theo dõi, mỗi lần ghi sẽ kích hoạt effect và tụt khung hình.

### Ba thành phần tạo nên phong cách vẽ tay

Không có file texture nào; toàn bộ vẻ "vẽ tay" đến từ ba thứ rời nhau:

1. **Viền mực** ([Outline.ts](app/game/render/Outline.ts)) — vẽ lại vật thể phình
   ra dọc pháp tuyến, chỉ hiện mặt sau. Cho nét dày đều tuyệt đối như nét bút,
   trong khi hậu kỳ dò biên depth/normal lại cho nét mảnh dần khi vật ở xa.
2. **Ramp toon 2 bậc** ([Materials.ts](app/game/render/Materials.ts)) — bề mặt
   chỉ có đúng hai mức sáng, nên hình khối đọc ra nhờ NÉT chứ không nhờ chuyển
   sáng. Ánh sáng môi trường được đẩy cao và mặt trời hạ thấp để củng cố điều đó.
3. **Vân giấy** ([main.css](app/assets/css/main.css)) — nhiễu `feTurbulence` nhân
   đè lên khung hình ở tầng CSS, phá vỡ những mảng màu phẳng tuyệt đối của đồ
   hoạ 3D. Không tốn gì của pipeline WebGL.

Luống đất cố ý là **đĩa bầu dục chồng mép nhau** chứ không phải ô vuông — lưới
vuông đều tăm tắp là thứ lộ ra ngay rằng đây là đồ hoạ máy tính.

### Vì sao không có file model nào

Toàn bộ cây, đá, pet, nhân vật, và 5 loại cây trồng × 5 giai đoạn đều dựng bằng
code từ Box/Cone/Icosahedron. Đổi một tham số trong `data/` là ra loài mới, không
cần mở Blender. Đây là lựa chọn có chủ đích cho giai đoạn POC — khi cần chất
lượng cao hơn thì thay `render/models/*` bằng glTF mà không đụng gameplay.

## Thêm nội dung mới

**Thêm cây trồng** — thêm một entry vào `app/game/data/crops.ts`. Hết. Model,
giai đoạn sinh trưởng, mục trong cửa hàng, nút chọn hạt đều tự sinh ra.

**Thêm loài pet** — thêm entry vào `app/game/data/pets.ts`. Trường `skills` quyết
định pet nhận được nghề nào.

**Thêm nghề cho pet** — thêm một nhánh vào `tileNeedsJob()` và `completeWork()`
trong `PetSystem.ts`, rồi thêm nhãn vào `JOB_LABEL` ở `PetPanel.vue`.

## Firebase (tuỳ chọn)

```bash
cp .env.example .env    # rồi điền key từ Firebase Console
firebase deploy --only firestore:rules
```

Bật **Anonymous Authentication** và **Cloud Firestore**. Game tự phát hiện: thiếu
biến môi trường thì chạy localStorage, có thì lưu cả hai và bản nào mới hơn thắng.

`firestore.rules` đã mở sẵn quyền đọc nông trại của người khác cho tài khoản đã
đăng nhập — đó là nền cho phần multiplayer.

## Lộ trình multiplayer

Thiết kế nhắm tới multiplayer **bất đồng bộ kiểu thăm nhà** (giúp tưới nước,
trộm cây) chứ không phải MMO đồng bộ vị trí. Vì vậy Firestore là đủ và **không
cần server game riêng**:

1. Lưu nông trại dưới `farms/{uid}` — đã xong.
2. Danh sách bạn bè + màn hình chọn nông trại để ghé thăm.
3. Chế độ khách: tải snapshot của chủ nhà ở dạng chỉ-đọc, khách chỉ được `create`
   vào `farms/{uid}/visits/*` (tưới giúp một ô, hoặc nhổ trộm một cây).
4. Chủ nhà vào game thì đọc hàng `visits`, kiểm tra tính hợp lệ phía client rồi
   áp dụng. Vì khách không ghi trực tiếp lên state chủ, cheat tệ nhất chỉ là
   spam — chặn bằng rate limit trong rules.
5. Trường `Crop.stolenBy` đã có sẵn trong kiểu dữ liệu để đánh dấu cây bị trộm.

Nếu sau này thực sự cần đồng bộ vị trí thời gian thực (<20 người), điểm cần thay
là `SceneManager.entityLayer` + một `RemotePlayerSystem` mới; toàn bộ luật chơi
trong `systems/` dùng lại được nguyên vẹn.

## Khi dev bị tự tải lại trang

Vite tải lại trang vì nhiều lý do và không phải lý do nào cũng in ra rõ ràng.
Dự án đã chặn sẵn hai nguyên nhân phổ biến nhất trong `nuxt.config.ts`:

- `optimizeDeps.include` khai báo trước `three` và `firebase/*`. Nếu để Vite tự
  phát hiện lúc chạy, mỗi lần phát hiện là một dòng `new dependencies optimized`
  kèm một cú full reload giữa lúc đang chơi.
- `devtools: { enabled: false }`. Nuxt DevTools nạp `@vue/devtools-core/kit`
  lúc chạy và gây ra đúng vấn đề trên.

Nguyên nhân thường gặp nhất còn lại **không phải lỗi**: Nuxt khởi động lại dev
server mỗi khi `nuxt.config.ts`, `.env`, `app.config.ts` hoặc file trong
`modules/` thay đổi, và mọi trình duyệt đang mở đều bị tải lại theo. Trên
terminal sẽ thấy `nuxt.config.ts updated. Restarting Nuxt...` ngay trước đó.

Nếu vẫn bị, mở console: [`app/plugins/reload-logger.client.ts`](app/plugins/reload-logger.client.ts)
sẽ in ra trang vừa tải lại sau bao lâu và vì sao. Nó ghi lý do vào
`sessionStorage` *trước* khi reload, nên lý do vẫn đọc được sau khi console đã
bị xoá.

Tiến độ **không mất** khi bị tải lại: `beforeunload` ghi snapshot vào
localStorage ngay trước khi trang đóng, và chuyển tab cũng kích hoạt lưu. Cái
mất đi chỉ là vị trí camera và ~1 giây tải lại.

## Việc còn thiếu

- Chưa có âm thanh.
- Chưa có điều khiển cảm ứng cho điện thoại (HUD đã responsive, input thì chưa).
- Pet đi theo đường thẳng, chỉ né vật cản một bước — đủ cho đồng trống, sẽ kẹt
  nếu sau này có mê cung. Cần A* thì thay `PetSystem.steer()`.
- Chưa có hệ thống nhân giống pet và chiến đấu.
