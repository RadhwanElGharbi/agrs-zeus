#include "App.h"
#include <spdlog/spdlog.h>

namespace agrs {
int App::run() {
  spdlog::info("App run invoked.");
  return 0;
}
}
