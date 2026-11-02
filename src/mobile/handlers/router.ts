import type { MobileRequest } from "../request";
import { jsonResponse } from "../request";
import { handleMobileHealth } from "./health";
import { handleMobileNews } from "./news";
import { handleMobileRefresh, refreshMethodNotAllowed } from "./refresh";
import { handleMobileSettings } from "./settings";
import { handleMobileTranslate } from "./translate";

export async function routeMobileApi(request: MobileRequest): Promise<Response> {
  switch (request.url.pathname) {
    case "/api/news":
      return handleMobileNews(request);
    case "/api/news/refresh":
      return request.method === "POST" ? handleMobileRefresh(request) : refreshMethodNotAllowed(request.method);
    case "/api/settings":
      return handleMobileSettings(request);
    case "/api/translate":
      return handleMobileTranslate(request);
    case "/api/health":
      return handleMobileHealth(request);
    default:
      return jsonResponse({ error: "Not found" }, { status: 404 });
  }
}
