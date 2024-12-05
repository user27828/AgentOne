from fastapi import Body, FastAPI, HTTPException, BackgroundTasks # type: ignore
from typing import List, Union, AsyncGenerator
import shutil  # For file handling
import os
import transformers # type: ignore # Make sure to install transformers and datasets
from transformers import AutoTokenizer, AutoModelForCausalLM, DataCollatorForLanguageModeling, Trainer, TrainingArguments # type: ignore
import datasets # type: ignore
from fastapi.responses import StreamingResponse # type: ignore
import json

app = FastAPI()

@app.post("/train/{project_id}/{model_name}")
async def train_model(project_id: str, model_name: str, background_tasks: BackgroundTasks, base_model_path: str = Body(...), output_path: str = Body(...), training_data_path: Union[str, List[str]] = Body(...)): # Receive base model path and output directory
    print(f"[train_model.py]: Project ID: {project_id}")
    print(f"[train_model.py]: Model Name: {model_name}")
    print(f"[train_model.py]: Base Model Path: {base_model_path}")
    print(f"[train_model.py]: Output Path: {output_path}")
    print(f"[train_model.py]: training_data_path: {training_data_path}")
    #return {"message": "Parameters logged. Exiting before training."} 

    async def train_progress_generator() -> AsyncGenerator[str, None]: # Correct type hint
        try: 
            # Load Model and Tokenizer
            tokenizer = AutoTokenizer.from_pretrained(base_model_path)  
            model = AutoModelForCausalLM.from_pretrained(base_model_path) 

            # Tokenize data *here* after checking if it's a list
            if isinstance(training_data, list):
                training_data = "\n".join(training_data)  # Join if it's from multiple files

            # Tokenize the training data
            tokenized_data = tokenizer(training_data, return_tensors="pt", padding=True, truncation=True)

            # Use a DataCollator for Language Modeling to create batches dynamically
            data_collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)  # mlm=False for causal language modeling

            # Fine-tune
            training_args = TrainingArguments(
                output_dir=output_path, #  output path from Node.js
                # ... other training arguments (per_device_train_batch_size, gradient_accumulation_steps, etc.)
            )
            trainer = Trainer(
                model=model,
                args=training_args,
                train_dataset=tokenized_data, 
                data_collator=data_collator,       # Use the data collator
            )

            def progress_callback(progress):
                # Yield the progress as a JSON string
                yield json.dumps({"progress": progress.progress, "status": "progress"}) + "\n"  # Send newline

            trainer.add_callback("on_train_begin", lambda x : print("on_train_begin"))

            await trainer.train(resume_from_checkpoint=False, callbacks=[progress_callback])

            trained_model_dir = training_args.output_dir  # get the output directory
            yield json.dumps({"status": "success", "trained_model_dir": trained_model_dir}) + "\n" # Send final status

        except Exception as e:
                yield json.dumps({"status": "error", "message": str(e)}) + "\n" # Stream the exception as well


    try:
        if isinstance(training_data_path, str):  # Single file path provided
            with open(training_data_path, 'r', encoding='utf-8') as f:
                training_data = f.read()

            background_tasks.add_task(cleanup_files, [training_data_path]) # Clean up the single file

        elif isinstance(training_data_path, list):  # List of file paths (for backwards compatibility)
            training_data = []
            for file_path in training_data_path:
                with open(file_path, 'r', encoding='utf-8') as f:
                    training_data.append(f.read())
            training_data = "\n".join(training_data)
            background_tasks.add_task(cleanup_files, training_data_path) # Clean up multiple files

        else:
            raise HTTPException(status_code=422, detail="training_data_path must be a string or a list of strings")  # More specific error

        return StreamingResponse(train_progress_generator(), media_type="text/event-stream") # Use async generator

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {e}")

# Background task function to clean up files after training. Prevents blocking the main thread.
def cleanup_files(file_paths: List[str]):
        for file_path in file_paths:
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"Error cleaning up file {file_path}: {e}")
