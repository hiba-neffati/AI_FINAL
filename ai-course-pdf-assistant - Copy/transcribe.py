import sys
import json
import warnings
import os

# Suppress warnings
warnings.filterwarnings("ignore")

try:
    from faster_whisper import WhisperModel
except ImportError:
    print(json.dumps({"error": "faster-whisper is not installed. Please run: pip install faster-whisper"}))
    sys.exit(1)

def main():
    if len(sys.argv) < 2:
         print(json.dumps({"error": "No input file provided"}))
         sys.exit(1)
         
    audio_path = sys.argv[1]
    
    try:
        # Load the model. Using 'tiny.en' or 'base' can be passed, let's use 'base' on CPU for broad compatibility
        model = WhisperModel("base", device="cpu", compute_type="int8")
        
        segments, info = model.transcribe(audio_path, beam_size=5)
        
        text = "".join([segment.text for segment in segments])
        print(json.dumps({"text": text.strip()}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
