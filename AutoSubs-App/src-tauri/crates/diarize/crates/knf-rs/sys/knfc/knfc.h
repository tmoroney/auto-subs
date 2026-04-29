#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
  float *frames;
  int32_t num_frames;
  int32_t num_bins;
} FbankResult;

extern "C" void DestroyFbankResult(FbankResult *result);

FbankResult ComputeFbank(const float *waveform, int32_t waveform_size);

#ifdef __cplusplus
}
#endif